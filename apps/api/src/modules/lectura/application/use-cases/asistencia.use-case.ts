import { PreguntaEnCurso, RespuestaAbiertaParaDocente } from '../../../shared-kernel/public-api';
import { Guion } from '../../domain/services/guion';
import { ItemLectura } from '../../domain/value-objects/contenido-lectura';
import { ContenidoLecturas, EscuelaLectura, SesionRepository } from '../ports/lectura.ports';

/** Lo que el asistente no debe decir de un ítem (RF-073): solo para su filtro de salida. */
function clavesDe(item: ItemLectura, oracion: Map<string, string>): string[] {
  const claves = [
    ...item.indicesCorrectos.map((i) => item.opciones[i]),
    ...item.clavesEvidencia.map((id) => oracion.get(id)),
    // Al niño se le muestran mezclados: decirlos en orden sería la respuesta.
    ...item.elementos,
    item.explicacionModelada,
  ];
  return [...new Set(claves.filter((c): c is string => Boolean(c?.trim())))];
}

/**
 * Lo que el asistente de lectura (Módulo 11) necesita de una sesión: la pregunta en pantalla con lo que
 * el niño ya puede leer (sin la clave, ADR-008) y, aparte, la clave para el filtro de salida; y, para
 * la docente, una respuesta abierta de su aula (RF-075, RN-17).
 */
export class AsistenciaLecturaUseCase {
  constructor(
    private readonly repo: SesionRepository,
    private readonly contenidos: ContenidoLecturas,
    private readonly escuela: EscuelaLectura,
  ) {}

  async preguntaDe(estudianteId: string, sesionId: string): Promise<PreguntaEnCurso | null> {
    const s = await this.repo.buscar(sesionId);
    if (!s || s.estudianteId !== estudianteId) return null;
    const contenido = await this.contenidos.version(s.versionLecturaId);
    if (!contenido) return null;
    const g = new Guion(contenido);
    const paso = s.pasoEnPantalla(g);
    const oracion = new Map(contenido.oraciones.map((o) => [o.id, o.texto]));
    const item = paso?.item;
    return {
      sesionId: s.id,
      lecturaId: s.lecturaId,
      titulo: contenido.titulo,
      rangoEdad: contenido.rangoEdad,
      fase: s.fase(g),
      textoVisible: s.oracionesVisibles(g).map((o) => o.texto),
      pregunta:
        paso && item
          ? {
              itemId: item.id,
              enunciado: item.enunciado,
              habilidad: item.habilidad,
              modalidad: item.modalidad,
              esCerrada: item.esCerrado,
              multiple: item.modalidad === 'SELECCION' && item.multiple,
              duranteLaLectura: paso.fase === 'LECTURA',
              pistasRestantes: Math.max(0, item.pistas.length - (s.respuestaDe(item.id)?.pistasUsadas ?? 0)),
            }
          : null,
      claves: item ? clavesDe(item, oracion) : [],
    };
  }

  async respuestaParaDocente(docenteId: string, respuestaId: string): Promise<RespuestaAbiertaParaDocente | null> {
    const s = await this.repo.buscarPorRespuesta(respuestaId);
    if (!s || !(await this.escuela.docenteAccedeAEstudiante(docenteId, s.estudianteId))) return null;
    const r = s.respuestas.find((x) => x.id === respuestaId);
    const contenido = await this.contenidos.version(s.versionLecturaId);
    const item = r && contenido ? new Guion(contenido).paso(r.itemId)?.item : undefined;
    const texto = (r?.contenido as { texto?: unknown } | undefined)?.texto;
    if (!r || !contenido || !item || item.esCerrado || typeof texto !== 'string') return null;
    return {
      respuestaId: r.id,
      estudianteId: s.estudianteId,
      rangoEdad: contenido.rangoEdad,
      enunciado: item.enunciado,
      habilidad: item.habilidad,
      minPalabras: item.minPalabras,
      respuesta: texto,
      texto: contenido.oraciones.map((o) => o.texto),
    };
  }
}
