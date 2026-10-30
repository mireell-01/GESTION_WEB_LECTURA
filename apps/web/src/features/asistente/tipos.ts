/** Contratos del asistente de lectura (Módulo 11, RF-072 a RF-075), tal como los entrega la API. */

export type Atajo = 'NO_ENTIENDO' | 'DONDE_BUSCO' | 'PALABRA' | 'COMO_EMPIEZO';

export interface Turno {
  emisor: 'ESTUDIANTE' | 'ASISTENTE';
  texto: string;
}

export interface EstadoAsistente {
  disponible: boolean;
  intercambios: number;
  restantes: number;
  turnos: Turno[];
}

export type EventoAsistente =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'fin'; restantes: number; filtrado: boolean; cerrada: boolean };

export interface ActivacionEstudiante {
  estudianteId: string;
  activo: boolean;
}

export interface ActivacionAula {
  aulaId: string;
  estudiantes: (ActivacionEstudiante & { alias: string; avatar: string })[];
}

export interface BorradorRetroalimentacion {
  respuestaId: string;
  borrador: string;
  criterios: { palabras: number; suficiente: boolean; daRazones: boolean; usaElTexto: boolean };
}

/** Las ayudas rápidas, para quienes aún no escriben con soltura (6–7 años). */
export const ATAJOS: { atajo: Atajo; texto: string }[] = [
  { atajo: 'NO_ENTIENDO', texto: 'No entiendo la pregunta' },
  { atajo: 'DONDE_BUSCO', texto: '¿Dónde busco?' },
  { atajo: 'PALABRA', texto: '¿Qué significa una palabra?' },
  { atajo: 'COMO_EMPIEZO', texto: '¿Cómo empiezo?' },
];

/** Lo que la familia y la docente leen antes de activarlo (ADR-008: activación con consentimiento). */
export const QUE_HACE_EL_ASISTENTE =
  'Durante la lectura podrá pedir ayuda para pensar: el asistente le hace preguntas y le sugiere cómo buscar en el texto, pero nunca le da la respuesta. Hasta 10 mensajes por lectura; no pide datos personales y las conversaciones se borran a los 30 días.';
