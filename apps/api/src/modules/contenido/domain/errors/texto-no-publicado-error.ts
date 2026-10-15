/**
 * Domain Error: TextoNoPublicadoError
 */
export class TextoNoPublicadoError extends Error {
  constructor(mensaje = 'TextoNoPublicadoError') {
    super(mensaje);
    this.name = 'TextoNoPublicadoError';
  }
}
