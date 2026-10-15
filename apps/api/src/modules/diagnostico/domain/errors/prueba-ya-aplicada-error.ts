/**
 * Domain Error: PruebaYaAplicadaError
 */
export class PruebaYaAplicadaError extends Error {
  constructor(mensaje = 'PruebaYaAplicadaError') {
    super(mensaje);
    this.name = 'PruebaYaAplicadaError';
  }
}
