import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

/** La acción no corresponde al momento de la sesión (SRS §3.6: INICIADA → EN_CURSO → FINALIZADA). */
export class TransicionSesionError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'CONFLICTO');
  }
}

/** RF-039: no se avanza sin responder la pregunta que está en pantalla. */
export class PasoFueraDeOrdenError extends ErrorDeNegocio {
  constructor(mensaje = 'Responde primero la pregunta que tienes en pantalla') {
    super(mensaje, 'CONFLICTO');
  }
}

export class RespuestaInvalidaError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'VALIDACION');
  }
}

/** RF-045: ya no quedan pistas para esa pregunta. */
export class SinPistasError extends ErrorDeNegocio {
  constructor() {
    super('Ya usaste todas las pistas de esta pregunta: ¡inténtalo!', 'CONFLICTO');
  }
}

/** RF-047: el cierre llega con todas las actividades hechas. */
export class LecturaIncompletaError extends ErrorDeNegocio {
  constructor(faltan: number) {
    super(`Aún te ${faltan === 1 ? 'falta 1 actividad' : `faltan ${faltan} actividades`} para terminar la lectura`, 'CONFLICTO', { faltan });
  }
}

/** RF-051: solo se valora una respuesta abierta que espera revisión, una vez. */
export class ValoracionInvalidaError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'CONFLICTO');
  }
}
