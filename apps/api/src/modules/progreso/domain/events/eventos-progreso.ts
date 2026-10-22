import { EVENTOS_INTEGRACION } from '../../../shared-kernel/public-api';

/** Eventos de Progreso (SAD §6): Aventura evalúa el desbloqueo y Gamificación otorga los +50 (RN-11). */
export const EVENTOS_PROGRESO = {
  PERFIL_INICIADO: 'progreso.PerfilLectorIniciado',
  MAESTRIA_ACTUALIZADA: EVENTOS_INTEGRACION.MAESTRIA_ACTUALIZADA,
  NIVEL_SUBIDO: EVENTOS_INTEGRACION.MAESTRIA_NIVEL_SUBIDO,
} as const;
