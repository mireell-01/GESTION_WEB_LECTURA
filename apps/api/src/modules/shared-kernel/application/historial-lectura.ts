/**
 * Puerto que el seguimiento docente (Módulo 9, RF-064) necesita de Lectura: las últimas sesiones del
 * estudiante con cada respuesta, las evidencias que eligió y las pistas que usó. Lectura lo registra al
 * iniciar; mientras no exista, no hay historial. Nunca incluye claves de respuesta (ADR-007).
 */
export interface PistaUsada {
  /** P1, P2, P3 o EXPLICACION (la explicación modelada tras agotar las pistas). */
  nivel: string;
  texto: string | null;
}

export interface RespuestaDeHistorial {
  itemId: string;
  enunciado: string;
  habilidad: string;
  modalidad: string;
  /** Cerrada: se corrigió; null: abierta (la valora la docente, RN-19). */
  esCorrecta: boolean | null;
  pistasUsadas: number;
  pistas: PistaUsada[];
  /** EVIDENCIA (RF-043): las oraciones que tocó el niño. */
  evidencias: string[];
  /** Lo que respondió, legible: la opción elegida, el orden, el texto escrito o dictado. */
  respuesta: string | null;
  estado: string;
}

export interface SesionDeHistorial {
  sesionId: string;
  lecturaId: string;
  titulo: string;
  estado: string;
  esRepeticion: boolean;
  iniciadaEn: Date;
  ultimaActividadEn: Date;
  finalizadaEn: Date | null;
  respuestas: RespuestaDeHistorial[];
}

export interface ResolutorHistorialLectura {
  /** Las últimas `limite` sesiones, de la más reciente a la más antigua. */
  historialDe(estudianteId: string, limite: number): Promise<SesionDeHistorial[]>;
}

export interface RegistroHistorialLectura extends ResolutorHistorialLectura {
  registrar(resolutor: ResolutorHistorialLectura): void;
}

export const HISTORIAL_LECTURA = Symbol('HISTORIAL_LECTURA');
