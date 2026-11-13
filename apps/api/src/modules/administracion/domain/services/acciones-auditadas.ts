/**
 * RF-077: las acciones sensibles que se auditan, con su nombre para la administración. El SRS pide
 * auditar accesos a datos de estudiantes, cambios de PIN, consentimientos, exportaciones,
 * eliminaciones, publicaciones y cambios de cuentas.
 */
export const ACCIONES_AUDITADAS = {
  // Cuentas y acceso (IAM)
  CONSENTIMIENTO_OTORGADO: 'Consentimiento otorgado',
  PIN_RESTABLECIDO: 'PIN restablecido',
  CONTRASENA_RESTABLECIDA: 'Contraseña restablecida',
  MFA_CONFIGURADO: 'Verificación en dos pasos configurada',
  SESION_REVOCADA_POR_REUTILIZACION: 'Sesión cerrada por un enlace de sesión reutilizado',
  ESTUDIANTE_BLOQUEADO: 'Estudiante bloqueado por PIN incorrectos',
  DISPOSITIVO_VINCULADO: 'Tablet o dispositivo activado',
  PERFIL_DESACTIVADO: 'Perfil de estudiante desactivado',
  DATOS_EXPORTADOS: 'Datos de un estudiante exportados',
  PERFIL_ELIMINADO: 'Perfil de estudiante eliminado',
  // Administración de la plataforma (RF-076, RF-078)
  DOCENTE_DADO_DE_ALTA: 'Docente dado de alta',
  CUENTA_SUSPENDIDA: 'Cuenta suspendida',
  CUENTA_REACTIVADA: 'Cuenta reactivada',
  CUENTA_GOOGLE_VINCULADA: 'Cuenta vinculada con Google',
  CUENTA_GOOGLE_DESVINCULADA: 'Cuenta desvinculada de Google',
  INSTITUCION_CREADA: 'Institución registrada',
  INSTITUCION_SUSPENDIDA: 'Institución suspendida',
  INSTITUCION_REACTIVADA: 'Institución reactivada',
  PARAMETROS_GAMIFICACION_PUBLICADOS: 'Parámetros de gamificación publicados',
  AUDITORIA_CONSULTADA: 'Auditoría consultada',
  // Escuela
  INVITACION_FAMILIAR_GENERADA: 'Código para la familia generado',
  FAMILIAR_VINCULADO: 'Familiar vinculado',
  TARJETAS_ACCESO_GENERADAS: 'Tarjetas de acceso impresas (PIN nuevos)',
  ESTUDIANTE_RETIRADO: 'Estudiante retirado de un aula',
  AULA_ARCHIVADA: 'Aula archivada',
  // Accesos a datos de estudiantes (Reporting)
  DETALLE_ESTUDIANTE_CONSULTADO: 'Detalle de un estudiante consultado',
  REPORTE_AULA_DESCARGADO: 'Reporte de un aula descargado',
  // Contenido y aventura
  LECTURA_ENVIADA_A_REVISION: 'Lectura enviada a revisión',
  LECTURA_PUBLICADA: 'Lectura publicada',
  LECTURA_RECHAZADA: 'Lectura devuelta con observaciones',
  LECTURA_ARCHIVADA: 'Lectura archivada',
  LECTURA_NUEVA_VERSION: 'Nueva versión de una lectura',
  MISION_CREADA: 'Misión creada',
  MISION_ACTUALIZADA: 'Misión actualizada',
  MISIONES_REORDENADAS: 'Misiones reordenadas',
} as const;

export type AccionAuditada = keyof typeof ACCIONES_AUDITADAS;

export function esAccionAuditada(accion: string): accion is AccionAuditada {
  return Object.prototype.hasOwnProperty.call(ACCIONES_AUDITADAS, accion);
}

/** El nombre de una acción para la administración (una acción antigua sin nombre se muestra tal cual). */
export function etiquetaAccion(accion: string): string {
  return esAccionAuditada(accion) ? ACCIONES_AUDITADAS[accion] : accion;
}
