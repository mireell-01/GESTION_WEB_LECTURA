import type { Habilidad } from '../domain/value-objects/habilidad';
import type { Maestrias } from './progreso-lector';

/**
 * Eventos de integración que publicarán los módulos posteriores y que Aventura ya escucha
 * (SAD §6, "Eventos de dominio principales"). Se definen aquí para que el contrato exista antes
 * que sus emisores, sin dependencias entre módulos.
 */
export const EVENTOS_INTEGRACION = {
  /** Diagnóstico → Aventura posiciona al estudiante en su mundo inicial (RF-033). */
  DIAGNOSTICO_FINALIZADO: 'diagnostico.DiagnosticoFinalizado',
  /** Lectura → Aventura actualiza el estado de las misiones que contienen la lectura (RF-032). */
  SESION_LECTURA_INICIADA: 'lectura.SesionLecturaIniciada',
  SESION_LECTURA_FINALIZADA: 'lectura.SesionLecturaFinalizada',
  /** Lectura → Progreso actualiza la maestría (RF-053, RN-07) y Gamificación otorga puntos (RN-11). */
  ITEM_RESPONDIDO: 'lectura.ItemRespondido',
  /** Lectura → Progreso actualiza ARG/CRI con la valoración docente (RF-051, RN-19). */
  RESPUESTA_ABIERTA_VALORADA: 'lectura.RespuestaAbiertaValorada',
  /** Progreso → Aventura evalúa el desbloqueo del mundo siguiente (RF-031, RN-09). */
  MAESTRIA_ACTUALIZADA: 'progreso.MaestriaActualizada',
  /** Progreso → Gamificación otorga +50 al subir el nivel CNEB de una habilidad (RN-11) · Aventura evalúa desbloqueo. */
  MAESTRIA_NIVEL_SUBIDO: 'progreso.MaestriaNivelSubido',
} as const;

export interface DatosDiagnosticoFinalizado {
  estudianteId: string;
  maestrias: Maestrias;
  diagnosticoId?: string;
  /** INICIAL o REEVALUACION (RF-037): el perfil lector solo parte del inicial. */
  tipo?: string;
  /** Ítems respondidos por habilidad (RN-08 los cuenta para declarar el nivel). */
  items?: Partial<Record<Habilidad, number>>;
}

export interface DatosSesionLectura {
  estudianteId: string;
  lecturaId: string;
  sesionId?: string;
  /** RN-12: repetir una lectura ya terminada (Gamificación otorga menos puntos). */
  esRepeticion?: boolean;
}

export interface DatosItemRespondido {
  estudianteId: string;
  /** Identifica la respuesta: así Progreso no la cuenta dos veces si el evento se reintenta. */
  respuestaId: string;
  sesionId: string;
  lecturaId: string;
  itemId: string;
  habilidad: string;
  nivelDificultad: number;
  /** null en las respuestas abiertas, que esperan la valoración docente (RN-19). */
  esCorrecta: boolean | null;
  pistasUsadas: number;
  /** RN-07 (0–1); null en las abiertas. */
  puntajeItem: number | null;
  esRepeticion: boolean;
  /** Abiertas: cuántas palabras escribió (RN-19, puntos de esfuerzo). */
  palabras: number | null;
}

export interface DatosRespuestaAbiertaValorada {
  estudianteId: string;
  respuestaId: string;
  itemId: string;
  habilidad: string;
  nivelDificultad: number;
  /** Rúbrica de 3 niveles (RF-051) y su puntaje de ítem (0–1). */
  nivel: number;
  puntajeItem: number;
}

export interface DatosMaestriaActualizada {
  estudianteId: string;
  habilidad?: string;
  valorAnterior?: number;
  valorNuevo?: number;
}
