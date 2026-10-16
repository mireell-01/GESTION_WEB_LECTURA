/**
 * Domain Event: AventuraIniciada — capa de dominio.
 */
export interface AventuraIniciadaProps {
  // TODO: payload del evento
}

export class AventuraIniciada {
  readonly nombreEvento = 'AventuraIniciada';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: AventuraIniciadaProps) {}
}
