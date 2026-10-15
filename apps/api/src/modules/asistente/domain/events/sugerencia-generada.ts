/**
 * Domain Event: SugerenciaGenerada — capa de dominio.
 */
export interface SugerenciaGeneradaProps {
  // TODO: payload del evento
}

export class SugerenciaGenerada {
  readonly nombreEvento = 'SugerenciaGenerada';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: SugerenciaGeneradaProps) {}
}
