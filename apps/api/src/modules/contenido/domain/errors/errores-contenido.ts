import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

export class DatoLecturaInvalidoError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'VALIDACION');
  }
}

/** RN-14: una versión publicada, en revisión o archivada no se edita. */
export class VersionNoEditableError extends ErrorDeNegocio {
  constructor() {
    super('Esta versión ya no se puede editar: crea una nueva versión desde la publicada', 'CONFLICTO');
  }
}

/** RF-026: transición del flujo de publicación que no corresponde al estado actual. */
export class TransicionInvalidaError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'CONFLICTO');
  }
}

/** RF-021, RF-025, RN-15: lo que falta para enviar a revisión o publicar. */
export class LecturaIncompletaError extends ErrorDeNegocio {
  constructor(readonly problemas: string[]) {
    super(`La lectura aún no está lista: ${problemas.join(' · ')}`, 'VALIDACION', { problemas });
  }
}

/** RF-026, RN-15: el autor no aprueba su propio contenido. */
export class AutorNoPuedeAprobarError extends ErrorDeNegocio {
  constructor() {
    super('Quien escribió la lectura no puede aprobarla: debe revisarla otra persona', 'PROHIBIDO');
  }
}

/** Solo quien escribe el borrador lo edita (evita ediciones cruzadas entre editores). */
export class NoEsAutorError extends ErrorDeNegocio {
  constructor() {
    super('Solo la persona que escribe este borrador puede modificarlo', 'PROHIBIDO');
  }
}

/** RF-023: archivo que no corresponde a lo declarado o excede los límites. */
export class RecursoInvalidoError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'VALIDACION');
  }
}

/** RF-029: el grafo de la historia no cumple las reglas (acíclico, todo nodo llega a un final). */
export class GrafoInvalidoError extends ErrorDeNegocio {
  constructor(readonly problemas: string[]) {
    super(`La historia ramificada tiene problemas: ${problemas.join(' · ')}`, 'VALIDACION', { problemas });
  }
}
