import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

export class EnlaceInvalidoError extends ErrorDeNegocio {
  constructor() {
    super('El enlace no es válido, ya fue usado o venció', 'VALIDACION');
  }
}
