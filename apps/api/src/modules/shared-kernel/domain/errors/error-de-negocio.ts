/**
 * Error de negocio — base de todos los errores esperados del dominio y la aplicación.
 * El `tipo` lo traduce a HTTP el filtro global de la capa interface; el dominio no conoce HTTP.
 */
export type TipoErrorNegocio =
  | 'VALIDACION' // 400
  | 'NO_AUTENTICADO' // 401
  | 'PROHIBIDO' // 403
  | 'NO_ENCONTRADO' // 404
  | 'CONFLICTO' // 409
  | 'BLOQUEADO' // 423
  | 'LIMITE'; // 429

export class ErrorDeNegocio extends Error {
  constructor(
    mensaje: string,
    readonly tipo: TipoErrorNegocio = 'VALIDACION',
    readonly detalle?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = new.target.name;
  }
}

export class NoEncontradoError extends ErrorDeNegocio {
  constructor(recurso: string) {
    super(`${recurso} no encontrado`, 'NO_ENCONTRADO');
  }
}

export class ProhibidoError extends ErrorDeNegocio {
  constructor(mensaje = 'No tienes permiso para realizar esta acción') {
    super(mensaje, 'PROHIBIDO');
  }
}
