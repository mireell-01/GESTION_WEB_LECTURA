/**
 * Domain Event: AuditoriaRegistrada — capa de dominio.
 */
export interface AuditoriaRegistradaProps {
  // TODO: payload del evento
}

export class AuditoriaRegistrada {
  readonly nombreEvento = 'AuditoriaRegistrada';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: AuditoriaRegistradaProps) {}
}
