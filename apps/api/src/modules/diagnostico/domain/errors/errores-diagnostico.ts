import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

/** RF-034, RF-037: no hay un reto que empezar o continuar. */
export class SinRetoPendienteError extends ErrorDeNegocio {
  constructor() {
    super('No tienes retos pendientes: ¡ya completaste tu reto!', 'CONFLICTO');
  }
}

/** Transición que no corresponde al estado del diagnóstico (SRS §3.5). */
export class TransicionDiagnosticoError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'CONFLICTO');
  }
}

/** RF-036: se responde la pregunta que sigue, en orden (así se reanuda en el ítem siguiente). */
export class ItemFueraDeOrdenError extends ErrorDeNegocio {
  constructor() {
    super('Responde la pregunta que tienes en pantalla', 'CONFLICTO');
  }
}

export class RespuestaInvalidaError extends ErrorDeNegocio {
  constructor() {
    super('Elige una de las opciones', 'VALIDACION');
  }
}

/** RF-035: el nivel se calcula con el reto completo. */
export class DiagnosticoIncompletoError extends ErrorDeNegocio {
  constructor(faltan: number) {
    super(`Aún faltan ${faltan} ${faltan === 1 ? 'pregunta' : 'preguntas'} para terminar el reto`, 'CONFLICTO', { faltan });
  }
}
