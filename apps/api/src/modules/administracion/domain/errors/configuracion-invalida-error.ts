/**
 * Domain Error: ConfiguracionInvalidaError
 */
export class ConfiguracionInvalidaError extends Error {
  constructor(mensaje = 'ConfiguracionInvalidaError') {
    super(mensaje);
    this.name = 'ConfiguracionInvalidaError';
  }
}
