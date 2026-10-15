/**
 * Domain Event: RecursoAdjunto — capa de dominio.
 */
export interface RecursoAdjuntoProps {
  // TODO: payload del evento
}

export class RecursoAdjunto {
  readonly nombreEvento = 'RecursoAdjunto';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: RecursoAdjuntoProps) {}
}
