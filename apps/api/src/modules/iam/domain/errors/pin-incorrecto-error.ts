import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

export class PinIncorrectoError extends ErrorDeNegocio {
  constructor(intentosRestantes?: number) {
    super('PIN incorrecto', 'NO_AUTENTICADO', intentosRestantes === undefined ? undefined : { intentosRestantes });
  }
}
