/**
 * Eventos de dominio de IAM. Administración los registra en la auditoría (RF-077)
 * y los demás módulos reaccionan a la eliminación de perfiles (RF-013).
 */
export const EVENTOS_IAM = {
  CUENTA_CREADA: 'iam.CuentaCreada',
  CUENTA_VERIFICADA: 'iam.CuentaVerificada',
  CONTRASENA_RESTABLECIDA: 'iam.ContrasenaRestablecida',
  CONSENTIMIENTO_OTORGADO: 'iam.ConsentimientoOtorgado',
  PERFIL_CREADO: 'iam.PerfilEstudianteCreado',
  ESTUDIANTE_BLOQUEADO: 'iam.EstudianteBloqueado',
  PIN_RESTABLECIDO: 'iam.PinRestablecido',
  PERFIL_DESACTIVADO: 'iam.PerfilEstudianteDesactivado',
  DATOS_EXPORTADOS: 'iam.DatosEstudianteExportados',
  PERFIL_ELIMINADO: 'iam.PerfilEstudianteEliminado',
  MFA_CONFIGURADO: 'iam.MfaConfigurado',
  DISPOSITIVO_VINCULADO: 'iam.DispositivoFamiliarVinculado',
  /** ADR-005: se presentó un refresh token ya rotado (posible robo); la sesión se revoca. */
  REUTILIZACION_REFRESH: 'iam.ReutilizacionRefreshDetectada',
} as const;

/** Datos comunes para auditoría: quién hizo la acción (cuenta adulta o sistema). */
export interface DatosActor {
  actorId: string;
}
