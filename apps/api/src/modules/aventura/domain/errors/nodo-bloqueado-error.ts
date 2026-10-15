/**
 * Domain Error: NodoBloqueadoError
 */
export class NodoBloqueadoError extends Error {
  constructor(mensaje = 'NodoBloqueadoError') {
    super(mensaje);
    this.name = 'NodoBloqueadoError';
  }
}
