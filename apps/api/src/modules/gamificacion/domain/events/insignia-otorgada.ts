/**
 * Domain Event: InsigniaOtorgada — capa de dominio.
 */
export interface InsigniaOtorgadaProps {
  // TODO: payload del evento
}

export class InsigniaOtorgada {
  readonly nombreEvento = 'InsigniaOtorgada';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: InsigniaOtorgadaProps) {}
}
