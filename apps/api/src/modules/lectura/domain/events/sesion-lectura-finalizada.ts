/**
 * Domain Event: SesionLecturaFinalizada — capa de dominio.
 */
export interface SesionLecturaFinalizadaProps {
  // TODO: payload del evento
}

export class SesionLecturaFinalizada {
  readonly nombreEvento = 'SesionLecturaFinalizada';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: SesionLecturaFinalizadaProps) {}
}
