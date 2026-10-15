/**
 * Domain Service: PoliticaSesion — reglas de vida del token y expiración por inactividad (RF-010).
 */
export class PoliticaSesion {
  /** Duración del access token (RF-003): 15 minutos. */
  static readonly ACCESS_TOKEN_MIN = 15;
  /** Inactividad máxima de un estudiante en aula (RF-010): 10 minutos. */
  static readonly INACTIVIDAD_ESTUDIANTE_MIN = 10;
  /** Inactividad máxima de un adulto (RF-010): 30 minutos. */
  static readonly INACTIVIDAD_ADULTO_MIN = 30;

  /** Devuelve la ventana de inactividad aplicable según el rol. */
  static ventanaInactividadMin(esEstudiante: boolean): number {
    return esEstudiante ? this.INACTIVIDAD_ESTUDIANTE_MIN : this.INACTIVIDAD_ADULTO_MIN;
  }

  /** Calcula el instante de expiración del access token. */
  static expiracionAccessToken(ahora: Date): Date {
    return new Date(ahora.getTime() + this.ACCESS_TOKEN_MIN * 60_000);
  }

  /** Calcula la expiración por inactividad de la sesión. */
  static expiracionPorInactividad(ahora: Date, esEstudiante: boolean): Date {
    return new Date(
      ahora.getTime() + this.ventanaInactividadMin(esEstudiante) * 60_000,
    );
  }
}
