/** Eventos de dominio de Escuela (auditoría y proyecciones de otros módulos). */
export const EVENTOS_ESCUELA = {
  AULA_CREADA: 'escuela.AulaCreada',
  ESTUDIANTE_MATRICULADO: 'escuela.EstudianteMatriculado',
  ESTUDIANTE_RETIRADO: 'escuela.EstudianteRetirado',
  TARJETAS_GENERADAS: 'escuela.TarjetasGeneradas',
  AULA_ARCHIVADA: 'escuela.AulaArchivada',
  ASIGNACION_CREADA: 'escuela.AsignacionCreada',
  ASIGNACION_CERRADA: 'escuela.AsignacionCerrada',
  INVITACION_FAMILIAR_GENERADA: 'escuela.InvitacionFamiliarGenerada',
  FAMILIAR_VINCULADO: 'escuela.FamiliarVinculado',
  /** RF-076: la administración registró, suspendió o reactivó una institución. */
  INSTITUCION_CREADA: 'escuela.InstitucionCreada',
  INSTITUCION_SUSPENDIDA: 'escuela.InstitucionSuspendida',
  INSTITUCION_REACTIVADA: 'escuela.InstitucionReactivada',
} as const;
