/**
 * Eventos de Gamificación (SAD §6). Quedan en el outbox para los paneles y notificaciones de los
 * módulos siguientes; hoy nadie más los escucha.
 */
export const EVENTOS_GAMIFICACION = {
  NIVEL_LECTOR_SUBIDO: 'gamificacion.NivelLectorSubido',
  INSIGNIA_OTORGADA: 'gamificacion.InsigniaOtorgada',
  RETO_COMPLETADO: 'gamificacion.RetoDelDiaCompletado',
  RECOMPENSA_CANJEADA: 'gamificacion.RecompensaCanjeada',
  /** RF-078: la administración publicó una versión nueva de los parámetros (se audita). */
  PARAMETROS_PUBLICADOS: 'gamificacion.ParametrosPublicados',
} as const;
