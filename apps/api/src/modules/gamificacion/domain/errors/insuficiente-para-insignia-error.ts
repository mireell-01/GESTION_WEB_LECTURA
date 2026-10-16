/**
 * Domain Error: InsuficienteParaInsigniaError
 */
export class InsuficienteParaInsigniaError extends Error {
  constructor(mensaje = 'InsuficienteParaInsigniaError') {
    super(mensaje);
    this.name = 'InsuficienteParaInsigniaError';
  }
}
