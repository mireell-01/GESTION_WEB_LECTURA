/**
 * Domain Error: SesionYaFinalizadaError
 */
export class SesionYaFinalizadaError extends Error {
  constructor(mensaje = 'SesionYaFinalizadaError') {
    super(mensaje);
    this.name = 'SesionYaFinalizadaError';
  }
}
