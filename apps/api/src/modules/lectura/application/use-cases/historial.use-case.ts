import { RespuestaDeHistorial, SesionDeHistorial } from '../../../shared-kernel/public-api';
import { RespuestaItem, SesionLectura } from '../../domain/entities/sesion-lectura';
import { ordenMostrado } from '../../domain/services/correccion';
import { Guion } from '../../domain/services/guion';
import { ContenidoLectura, ItemLectura } from '../../domain/value-objects/contenido-lectura';
import { ContenidoLecturas } from '../ports/lectura.ports';

/** Lo único que el historial necesita del repositorio de sesiones. */
export interface SesionesRecientes {
  ultimasDe(estudianteId: string, limite: number): Promise<SesionLectura[]>;
}

/** Lo que respondió el niño, legible para la docente (nunca la clave de respuesta). */
function respuestaLegible(s: SesionLectura, item: ItemLectura, r: RespuestaItem, evidencias: string[]): string | null {
  const c = r.contenido as Record<string, unknown>;
  if (typeof c['indice'] === 'number') return item.opciones[c['indice']] ?? null;
  if (Array.isArray(c['indices'])) return (c['indices'] as number[]).map((i) => item.opciones[i]).filter(Boolean).join(' · ');
  if (Array.isArray(c['orden'])) {
    // Las posiciones son de la lista tal como se le mostró (RF-042).
    const mostrado = ordenMostrado(item.elementos.length, `${s.id}:${item.id}`);
    return (c['orden'] as number[]).map((p) => item.elementos[mostrado[p] as number]).filter(Boolean).join(' → ');
  }
  if (Array.isArray(c['oraciones'])) return evidencias.join(' ');
  if (typeof c['texto'] === 'string') return c['texto'];
  return null;
}

function vistaRespuesta(s: SesionLectura, contenido: ContenidoLectura, item: ItemLectura, r: RespuestaItem): RespuestaDeHistorial {
  const texto = new Map(contenido.oraciones.map((o) => [o.id, o.texto]));
  const c = r.contenido as { oraciones?: string[] };
  const evidencias = (c.oraciones ?? []).map((id) => texto.get(id)).filter((t): t is string => Boolean(t));
  return {
    itemId: item.id,
    enunciado: item.enunciado,
    habilidad: item.habilidad,
    modalidad: item.modalidad,
    esCorrecta: r.esCorrecta,
    pistasUsadas: r.pistasUsadas,
    pistas: r.usos.map((u) => ({
      nivel: u.nivel,
      texto: u.nivel === 'EXPLICACION' ? item.explicacionModelada : (item.pistas.find((p) => p.nivel === u.nivel)?.texto ?? null),
    })),
    evidencias,
    respuesta: respuestaLegible(s, item, r, evidencias),
    estado: r.estado,
  };
}

/**
 * RF-064 (Módulo 9): las últimas sesiones del estudiante para el detalle docente, con cada respuesta en
 * el orden de la lectura, las evidencias que eligió y las pistas que usó. La pertenencia al aula (RN-17)
 * la verifica quien consulta.
 */
export class HistorialUseCase {
  constructor(
    private readonly repo: SesionesRecientes,
    private readonly contenidos: ContenidoLecturas,
  ) {}

  async historialDe(estudianteId: string, limite: number): Promise<SesionDeHistorial[]> {
    const sesiones = await this.repo.ultimasDe(estudianteId, limite);
    const guiones = new Map<string, Guion | null>();
    const vistas: SesionDeHistorial[] = [];
    for (const s of sesiones) {
      if (!guiones.has(s.versionLecturaId)) {
        const contenido = await this.contenidos.version(s.versionLecturaId);
        guiones.set(s.versionLecturaId, contenido ? new Guion(contenido) : null);
      }
      const g = guiones.get(s.versionLecturaId);
      if (!g) continue;
      const porItem = new Map(s.respuestas.map((r) => [r.itemId, r]));
      const respuestas = g.pasos.flatMap((p) => {
        const r = porItem.get(p.item.id);
        return r ? [vistaRespuesta(s, g.contenido, p.item, r)] : [];
      });
      const d = s.propsSnapshot;
      vistas.push({
        sesionId: s.id,
        lecturaId: s.lecturaId,
        titulo: g.contenido.titulo,
        estado: s.estado,
        esRepeticion: s.esRepeticion,
        iniciadaEn: d.iniciadaEn,
        ultimaActividadEn: s.ultimaActividadEn,
        finalizadaEn: s.finalizadaEn,
        respuestas,
      });
    }
    return vistas;
  }
}
