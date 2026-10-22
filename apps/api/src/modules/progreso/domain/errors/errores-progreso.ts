import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

/** Otro cambio guardó la maestría primero (bloqueo optimista, SRS §7): se vuelve a calcular. */
export class MaestriaDesactualizadaError extends ErrorDeNegocio {
  constructor() {
    super('La maestría cambió mientras se actualizaba', 'CONFLICTO');
  }
}
