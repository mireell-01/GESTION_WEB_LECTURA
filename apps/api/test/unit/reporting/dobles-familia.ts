/**
 * Dobles de prueba del acompañamiento familiar (Módulo 10): las vistas del schema `reporting` y las
 * preferencias en memoria, los hijos de la familia (IAM), su correo y las lecturas terminadas.
 */
import type { LecturaRealizada, ResolutorLecturasRealizadas } from '../../../src/modules/shared-kernel/public-api';
import type {
  AvanceEstudiante,
  HijoFamilia,
  HijosFamilia,
  NotificadorFamilia,
  ReportesFamiliaRepository,
} from '../../../src/modules/reporting/application/ports/familia.ports';
import { PanelHijoUseCase } from '../../../src/modules/reporting/application/use-cases/panel-hijo.use-case';
import { PreferenciasFamiliaUseCase } from '../../../src/modules/reporting/application/use-cases/preferencias-familia.use-case';
import { ResumenFamiliarUseCase } from '../../../src/modules/reporting/application/use-cases/resumen-familiar.use-case';
import { MaestriaMedida } from '../../../src/modules/reporting/domain/services/mapa-calor';
import { ActividadSemanal } from '../../../src/modules/reporting/domain/services/resumen-semanal';
import { HmacFirmaBaja } from '../../../src/modules/reporting/infrastructure/firma-baja';
import { Reloj } from '../iam/dobles';
import { FichasFalsas } from './dobles';

export class FamiliaEnMemoria implements ReportesFamiliaRepository {
  refresco: Date | null = new Date('2026-10-21T14:55:00Z');
  readonly medidas = new Map<string, MaestriaMedida[]>();
  readonly avances = new Map<string, AvanceEstudiante>();
  readonly actividad = new Map<string, Date>();
  readonly semanal: ActividadSemanal[] = [];
  /** cuenta → hijos activos (vista `v_hijos_familia`). */
  readonly familias = new Map<string, string[]>();
  readonly prefs = new Map<string, boolean>();
  readonly resumenes = new Set<string>();

  async refrescadoEn() {
    return this.refresco;
  }
  async ultimaActividad(ids: string[]) {
    return new Map([...this.actividad].filter(([id]) => ids.includes(id)));
  }
  async actividadSemanal(ids: string[], semanas: string[]) {
    return this.semanal.filter((a) => ids.includes(a.estudianteId) && semanas.includes(a.semana));
  }
  async maestriasPerfil(estudianteId: string) {
    return this.medidas.get(estudianteId) ?? [];
  }
  async avance(estudianteId: string) {
    return this.avances.get(estudianteId) ?? null;
  }
  async hijosPorFamilia() {
    return new Map(this.familias);
  }
  async preferencias(cuentaIds: string[]) {
    return new Map([...this.prefs].filter(([id]) => cuentaIds.includes(id)));
  }
  async guardarPreferencia(cuentaId: string, resumenSemanal: boolean) {
    this.prefs.set(cuentaId, resumenSemanal);
  }
  async registrarResumenFamiliar(cuentaId: string, semana: string) {
    const llave = `${cuentaId}:${semana}`;
    if (this.resumenes.has(llave)) return false;
    this.resumenes.add(llave);
    return true;
  }
  async liberarResumenFamiliar(cuentaId: string, semana: string) {
    this.resumenes.delete(`${cuentaId}:${semana}`);
  }

  /** Atajo: la maestría de un estudiante en las habilidades indicadas (6 preguntas cada una, o las dadas). */
  maestria(estudianteId: string, valores: Record<string, number>, items = 6) {
    this.medidas.set(estudianteId, Object.entries(valores).map(([habilidad, valor]) => ({ habilidad, valor, items })));
  }
}

export class HijosFalsos implements HijosFamilia {
  readonly porCuenta = new Map<string, HijoFamilia[]>();
  async hijosDe(cuentaId: string) {
    return this.porCuenta.get(cuentaId) ?? [];
  }
}

export class CorreoFamiliaFalso implements NotificadorFamilia {
  readonly enviados: { cuentaId: string; asunto: string; texto: string; enlace?: string; bajaUrl?: string }[] = [];
  /** Familias a las que el servidor de correo rechaza el envío. */
  readonly fallaPara = new Set<string>();
  async notificar(cuentaId: string, mensaje: { asunto: string; texto: string; enlace?: string; bajaUrl?: string }) {
    if (this.fallaPara.has(cuentaId)) throw new Error('SMTP no disponible');
    this.enviados.push({ cuentaId, ...mensaje });
    return true;
  }
}

export class RealizadasFalsas implements ResolutorLecturasRealizadas {
  readonly porEstudiante = new Map<string, LecturaRealizada[]>();
  async realizadasDe(estudianteId: string) {
    return this.porEstudiante.get(estudianteId) ?? [];
  }
}

export const SECRETO_PRUEBA = 'secreto-de-prueba-para-firmar-enlaces';

/** Ensambla los casos de uso de la familia con sus dobles; cada prueba crea su propio entorno limpio. */
export function crearEntornoFamilia() {
  const reloj = new Reloj(new Date('2026-10-21T15:00:00Z')); // miércoles 21, 10:00 en Lima
  const repo = new FamiliaEnMemoria();
  const hijos = new HijosFalsos();
  const fichas = new FichasFalsas();
  const realizadas = new RealizadasFalsas();
  const correo = new CorreoFamiliaFalso();
  const firma = new HmacFirmaBaja(SECRETO_PRUEBA);
  const panel = new PanelHijoUseCase(repo, hijos, fichas, realizadas, reloj.ahora);
  return {
    reloj,
    repo,
    hijos,
    fichas,
    realizadas,
    correo,
    firma,
    panel,
    preferencias: new PreferenciasFamiliaUseCase(repo, firma),
    resumen: new ResumenFamiliarUseCase(repo, hijos, panel, correo, firma, 'https://lectoaventura.pe', reloj.ahora),
  };
}

export type EntornoFamilia = ReturnType<typeof crearEntornoFamilia>;
