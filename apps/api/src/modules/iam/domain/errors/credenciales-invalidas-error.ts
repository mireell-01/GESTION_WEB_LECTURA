import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

export class CredencialesInvalidasError extends ErrorDeNegocio {
  constructor() {
    super('Correo o contraseña incorrectos', 'NO_AUTENTICADO');
  }
}
