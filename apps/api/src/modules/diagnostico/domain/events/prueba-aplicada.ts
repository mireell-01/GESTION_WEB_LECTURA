/**
 * Domain Event: PruebaAplicada — capa de dominio.
 */
export interface PruebaAplicadaProps {
  // TODO: payload del evento
}

export class PruebaAplicada {
  readonly nombreEvento = 'PruebaAplicada';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: PruebaAplicadaProps) {}
}
