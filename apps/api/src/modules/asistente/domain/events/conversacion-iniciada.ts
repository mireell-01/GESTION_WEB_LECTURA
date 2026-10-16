/**
 * Domain Event: ConversacionIniciada — capa de dominio.
 */
export interface ConversacionIniciadaProps {
  // TODO: payload del evento
}

export class ConversacionIniciada {
  readonly nombreEvento = 'ConversacionIniciada';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: ConversacionIniciadaProps) {}
}
