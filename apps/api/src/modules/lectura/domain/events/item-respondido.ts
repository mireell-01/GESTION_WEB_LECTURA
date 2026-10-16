/**
 * Domain Event: ItemRespondido — capa de dominio.
 */
export interface ItemRespondidoProps {
  // TODO: payload del evento
}

export class ItemRespondido {
  readonly nombreEvento = 'ItemRespondido';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: ItemRespondidoProps) {}
}
