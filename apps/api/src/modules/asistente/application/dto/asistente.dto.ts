import { CriteriosRespuesta } from '../../domain/services/borrador-retroalimentacion';

/** Lo que el niño puede enviar (lo valida la capa HTTP). */
export { ATAJOS, type Atajo } from '../../domain/services/mediacion-socratica';
export { MAX_CARACTERES_MENSAJE } from '../../domain/services/moderacion-entrada';

/** El asistente en una sesión de lectura: si está disponible y lo conversado (RF-072, RF-074). */
export interface EstadoAsistente {
  disponible: boolean;
  intercambios: number;
  restantes: number;
  turnos: { emisor: 'ESTUDIANTE' | 'ASISTENTE'; texto: string }[];
}

/** La respuesta a un mensaje del niño, ya revisada por el filtro (RF-073). */
export interface RespuestaAsistente {
  texto: string;
  restantes: number;
  /** El filtro reemplazó la respuesta por una guía segura. */
  filtrado: boolean;
  /** RF-074: ya no admite más intercambios en esta lectura. */
  cerrada: boolean;
}

export interface ActivacionEstudiante {
  estudianteId: string;
  activo: boolean;
}

export interface ActivacionAula {
  aulaId: string;
  estudiantes: (ActivacionEstudiante & { alias: string; avatar: string })[];
}

/** RF-075: propuesta para la docente; nunca se muestra al niño sin su aprobación. */
export interface BorradorRetroalimentacion {
  respuestaId: string;
  borrador: string;
  criterios: CriteriosRespuesta;
}
