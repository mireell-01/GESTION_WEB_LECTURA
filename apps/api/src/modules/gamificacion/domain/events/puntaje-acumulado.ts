/**
 * Domain Event: PuntajeAcumulado — capa de dominio.
 */
export interface PuntajeAcumuladoProps {
  // TODO: payload del evento
}

export class PuntajeAcumulado {
  readonly nombreEvento = 'PuntajeAcumulado';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: PuntajeAcumuladoProps) {}
}
