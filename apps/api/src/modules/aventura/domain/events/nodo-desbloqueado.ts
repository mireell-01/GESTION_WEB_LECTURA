/**
 * Domain Event: NodoDesbloqueado — capa de dominio.
 */
export interface NodoDesbloqueadoProps {
  // TODO: payload del evento
}

export class NodoDesbloqueado {
  readonly nombreEvento = 'NodoDesbloqueado';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: NodoDesbloqueadoProps) {}
}
