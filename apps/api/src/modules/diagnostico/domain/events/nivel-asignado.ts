/**
 * Domain Event: NivelAsignado — capa de dominio.
 */
export interface NivelAsignadoProps {
  // TODO: payload del evento
}

export class NivelAsignado {
  readonly nombreEvento = 'NivelAsignado';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: NivelAsignadoProps) {}
}
