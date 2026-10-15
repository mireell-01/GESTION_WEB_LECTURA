import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

export class EmailInvalidoError extends ErrorDeNegocio {
  constructor(valor: string) {
    super(`El correo electrónico no es válido: ${valor}`, 'VALIDACION');
  }
}
