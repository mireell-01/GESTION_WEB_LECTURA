import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

export class DatoMisionInvalidoError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'VALIDACION');
  }
}

/** RF-030: un mundo bloqueado todavía no se puede abrir. */
export class MundoBloqueadoError extends ErrorDeNegocio {
  constructor() {
    super('Este mundo todavía está bloqueado: completa el anterior para abrirlo', 'CONFLICTO');
  }
}

/** RN-05: sin el diagnóstico inicial no se habilita el mapa. */
export class DiagnosticoPendienteError extends ErrorDeNegocio {
  constructor() {
    super('Primero completa tu reto inicial para abrir el mapa de aventuras', 'CONFLICTO');
  }
}

/** SRS §7: un mundo tiene entre 3 y 20 misiones (por cada rango de edad). */
export class LimiteMisionesError extends ErrorDeNegocio {
  constructor(maximo: number) {
    super(`Este mundo ya tiene ${maximo} misiones para esa edad`, 'CONFLICTO');
  }
}
