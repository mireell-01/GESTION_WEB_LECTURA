/**
 * EventoDominio — contrato común de los eventos de dominio.
 * Los efectos entre módulos (maestría, puntos, insignias, desbloqueos) se disparan con estos eventos,
 * que se persisten en el outbox antes de despacharse (SRS §5, ADR-009).
 */
export interface EventoDominio<T extends object = Record<string, unknown>> {
  readonly nombreEvento: string;
  readonly agregadoId: string;
  readonly ocurreEn: Date;
  readonly datos: T;
}

export function crearEvento<T extends object>(
  nombreEvento: string,
  agregadoId: string,
  datos: T,
  ocurreEn: Date = new Date(),
): EventoDominio<T> {
  return { nombreEvento, agregadoId, ocurreEn, datos };
}
