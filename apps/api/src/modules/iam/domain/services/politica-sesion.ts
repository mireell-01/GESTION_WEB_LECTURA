/**
 * Servicio de dominio: PoliticaSesion — tiempos de vida de la sesión (RF-003, RF-010, ADR-005).
 */
export class PoliticaSesion {
  static readonly ACCESS_TOKEN_MIN = 15;
  static readonly INACTIVIDAD_ESTUDIANTE_MIN = 10;
  static readonly INACTIVIDAD_ADULTO_MIN = 30;
  /** ADR-005: el token de alcance ESTUDIANTE dura como máximo 8 h aunque haya actividad. */
  static readonly DURACION_MAXIMA_ESTUDIANTE_H = 8;

  static ventanaInactividadMin(esEstudiante: boolean): number {
    return esEstudiante ? this.INACTIVIDAD_ESTUDIANTE_MIN : this.INACTIVIDAD_ADULTO_MIN;
  }

  static expiracionPorInactividad(ultimaActividad: Date, esEstudiante: boolean): Date {
    return new Date(ultimaActividad.getTime() + this.ventanaInactividadMin(esEstudiante) * 60_000);
  }

  /** Límite absoluto de la sesión; null si no tiene (adultos: lo acota la cookie de 7 días). */
  static expiracionAbsoluta(creadaEn: Date, esEstudiante: boolean): Date | null {
    return esEstudiante ? new Date(creadaEn.getTime() + this.DURACION_MAXIMA_ESTUDIANTE_H * 3_600_000) : null;
  }
}
