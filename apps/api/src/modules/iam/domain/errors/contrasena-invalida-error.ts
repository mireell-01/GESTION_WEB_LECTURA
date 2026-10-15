import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

export class ContrasenaInvalidaError extends ErrorDeNegocio {
  constructor(motivo: string) {
    super(motivo, 'VALIDACION');
  }
}
