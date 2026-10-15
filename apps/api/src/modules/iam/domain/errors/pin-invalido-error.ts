import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

export class PinInvalidoError extends ErrorDeNegocio {
  constructor(motivo: string) {
    super(motivo, 'VALIDACION');
  }
}
