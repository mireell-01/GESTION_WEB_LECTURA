/**
 * Domain Error: ContextoInsuficienteError
 */
export class ContextoInsuficienteError extends Error {
  constructor(mensaje = 'ContextoInsuficienteError') {
    super(mensaje);
    this.name = 'ContextoInsuficienteError';
  }
}
