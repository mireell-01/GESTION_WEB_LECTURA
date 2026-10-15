/**
 * Domain Event: TextoPublicado — capa de dominio.
 */
export interface TextoPublicadoProps {
  // TODO: payload del evento
}

export class TextoPublicado {
  readonly nombreEvento = 'TextoPublicado';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: TextoPublicadoProps) {}
}
