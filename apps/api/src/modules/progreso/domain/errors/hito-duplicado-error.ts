/**
 * Domain Error: HitoDuplicadoError
 */
export class HitoDuplicadoError extends Error {
  constructor(mensaje = 'HitoDuplicadoError') {
    super(mensaje);
    this.name = 'HitoDuplicadoError';
  }
}
