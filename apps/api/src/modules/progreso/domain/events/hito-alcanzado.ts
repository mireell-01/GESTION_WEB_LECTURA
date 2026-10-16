/**
 * Domain Event: HitoAlcanzado — capa de dominio.
 */
export interface HitoAlcanzadoProps {
  // TODO: payload del evento
}

export class HitoAlcanzado {
  readonly nombreEvento = 'HitoAlcanzado';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: HitoAlcanzadoProps) {}
}
