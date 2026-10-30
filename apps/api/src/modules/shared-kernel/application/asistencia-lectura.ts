import type { Habilidad } from '../domain/value-objects/habilidad';
import type { RangoEdad } from '../domain/value-objects/rango-edad';

/**
 * Puertos que el asistente de lectura (Módulo 11, RF-072 a RF-075) necesita de Lectura. Lectura los
 * registra al iniciar; mientras no exista, no hay pregunta en curso ni respuestas abiertas.
 *
 * ADR-008: el asistente recibe el contexto de la pregunta, nunca la clave. La clave viaja aparte, solo
 * para el filtro de salida, que bloquea cualquier respuesta que la revele (RF-073, RN-16).
 */
export type FaseLectura = 'PREDICCION' | 'ANTES' | 'LECTURA' | 'HISTORIA' | 'DESPUES' | 'CIERRE' | 'FINALIZADA' | 'ABANDONADA';

export interface PreguntaEnCurso {
  sesionId: string;
  lecturaId: string;
  titulo: string;
  rangoEdad: RangoEdad;
  fase: FaseLectura;
  /** Las oraciones que el niño ya puede leer (en orden). */
  textoVisible: string[];
  /** La pregunta en pantalla; null en la predicción, la historia o el cierre. */
  pregunta: {
    itemId: string;
    enunciado: string;
    habilidad: Habilidad;
    modalidad: 'SELECCION' | 'ESCRITURA' | 'ORDENAMIENTO' | 'EVIDENCIA' | 'VOZ';
    esCerrada: boolean;
    /** SELECCION: puede haber más de una opción correcta (RF-040). */
    multiple: boolean;
    /** DURANTE: la pregunta aparece tras esta oración (RF-039). */
    duranteLaLectura: boolean;
    /** Cuántas pistas oficiales le quedan (cuestan puntaje, RN-07): el asistente no las reemplaza. */
    pistasRestantes: number;
  } | null;
  /**
   * Lo que el asistente nunca debe decir: la opción correcta, las oraciones de evidencia, los elementos
   * a ordenar y la explicación modelada. Solo para el filtro de salida; no se envía a ningún modelo.
   */
  claves: string[];
}

export interface ResolutorPreguntaEnCurso {
  /** null si la sesión no es del estudiante (RN-17) o no existe. */
  preguntaDe(estudianteId: string, sesionId: string): Promise<PreguntaEnCurso | null>;
}

export interface RegistroPreguntaEnCurso extends ResolutorPreguntaEnCurso {
  registrar(resolutor: ResolutorPreguntaEnCurso): void;
}

export const PREGUNTA_EN_CURSO = Symbol('PREGUNTA_EN_CURSO');

/** RF-075: una respuesta abierta (escrita o dictada) para el borrador de retroalimentación de la docente. */
export interface RespuestaAbiertaParaDocente {
  respuestaId: string;
  estudianteId: string;
  rangoEdad: RangoEdad;
  enunciado: string;
  habilidad: Habilidad;
  minPalabras: number | null;
  respuesta: string;
  /** El texto completo de la lectura (para ver si la respuesta se apoya en él). */
  texto: string[];
}

export interface ResolutorRespuestasAbiertas {
  /** null si no existe, no es abierta o el estudiante no es de un aula de la docente (RN-17). */
  respuestaParaDocente(docenteId: string, respuestaId: string): Promise<RespuestaAbiertaParaDocente | null>;
}

export interface RegistroRespuestasAbiertas extends ResolutorRespuestasAbiertas {
  registrar(resolutor: ResolutorRespuestasAbiertas): void;
}

export const RESPUESTAS_ABIERTAS = Symbol('RESPUESTAS_ABIERTAS');
