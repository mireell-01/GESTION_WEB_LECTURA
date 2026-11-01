import { ErrorDeNegocio } from '../../../shared-kernel/public-api';
import { esAccionAuditada } from './acciones-auditadas';

/** RF-077: la auditoría se conserva 2 años y luego se borra. */
export const RETENCION_AUDITORIA_ANIOS = 2;
/** Registros por página al consultar. */
export const POR_PAGINA = 50;

/** Desde cuándo se conserva la auditoría (lo anterior se borra). */
export function inicioRetencion(ahora: Date): Date {
  const limite = new Date(ahora);
  limite.setUTCFullYear(limite.getUTCFullYear() - RETENCION_AUDITORIA_ANIOS);
  return limite;
}

export interface FiltroAuditoria {
  desde: Date | null;
  hasta: Date | null;
  accion: string | null;
  actorId: string | null;
  recursoTipo: string | null;
  recursoId: string | null;
  /** Para la página siguiente: solo lo anterior a este registro (por fecha y id). */
  antesDe: { ocurridoEn: Date; id: string } | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fecha(valor: string | undefined, nombre: string): Date | null {
  if (!valor) return null;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw new ErrorDeNegocio(`La fecha «${nombre}» no es válida`, 'VALIDACION');
  return d;
}

/**
 * Valida los filtros de la consulta. "hasta" con solo la fecha incluye todo ese día (hora de Lima).
 * El cursor viene como "fechaISO_id" (lo devuelve la página anterior).
 */
export function filtroAuditoria(p: {
  desde?: string;
  hasta?: string;
  accion?: string;
  actorId?: string;
  recursoTipo?: string;
  recursoId?: string;
  antesDe?: string;
}): FiltroAuditoria {
  const desde = fecha(p.desde && /^\d{4}-\d{2}-\d{2}$/.test(p.desde) ? `${p.desde}T00:00:00-05:00` : p.desde, 'desde');
  const hasta = fecha(p.hasta && /^\d{4}-\d{2}-\d{2}$/.test(p.hasta) ? `${p.hasta}T23:59:59.999-05:00` : p.hasta, 'hasta');
  if (desde && hasta && desde > hasta) throw new ErrorDeNegocio('La fecha «desde» debe ser anterior a «hasta»', 'VALIDACION');
  if (p.accion && !esAccionAuditada(p.accion)) throw new ErrorDeNegocio('Esa acción no se audita', 'VALIDACION');
  if (p.actorId && !UUID.test(p.actorId)) throw new ErrorDeNegocio('El actor no es válido', 'VALIDACION');
  let antesDe: FiltroAuditoria['antesDe'] = null;
  if (p.antesDe) {
    const [iso, id] = p.antesDe.split('_');
    const cuando = iso ? new Date(iso) : null;
    if (!cuando || Number.isNaN(cuando.getTime()) || !id || !UUID.test(id)) throw new ErrorDeNegocio('La página pedida no es válida', 'VALIDACION');
    antesDe = { ocurridoEn: cuando, id };
  }
  return {
    desde,
    hasta,
    accion: p.accion || null,
    actorId: p.actorId || null,
    recursoTipo: p.recursoTipo?.trim() || null,
    recursoId: p.recursoId?.trim() || null,
    antesDe,
  };
}

/** El cursor de la página siguiente a partir del último registro mostrado. */
export function cursorDe(ultimo: { ocurridoEn: Date; id: string }): string {
  return `${ultimo.ocurridoEn.toISOString()}_${ultimo.id}`;
}
