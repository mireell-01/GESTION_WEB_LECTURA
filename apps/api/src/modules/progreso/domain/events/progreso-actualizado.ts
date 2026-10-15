/**
 * Domain Event: ProgresoActualizado — capa de dominio.
 */
export interface ProgresoActualizadoProps {
  // TODO: payload del evento
}

export class ProgresoActualizado {
  readonly nombreEvento = 'ProgresoActualizado';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: ProgresoActualizadoProps) {}
}
