/**
 * Eventos de dominio de Aventura. `MundoDesbloqueado` lo escuchará Gamificación (insignia de rango,
 * SAD §6); los cambios de misiones del equipo de contenidos quedan en la auditoría (RF-077).
 */
export const EVENTOS_AVENTURA = {
  ESTUDIANTE_POSICIONADO: 'aventura.EstudiantePosicionado',
  MISION_COMPLETADA: 'aventura.MisionCompletada',
  MUNDO_DESBLOQUEADO: 'aventura.MundoDesbloqueado',
  MISION_CREADA: 'aventura.MisionCreada',
  MISION_ACTUALIZADA: 'aventura.MisionActualizada',
  MISIONES_REORDENADAS: 'aventura.MisionesReordenadas',
} as const;
