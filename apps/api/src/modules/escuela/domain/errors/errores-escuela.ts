import { ErrorDeNegocio } from '../../../shared-kernel/public-api';

export class DatoAulaInvalidoError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'VALIDACION');
  }
}

/** RF-020: un aula archivada queda en solo lectura. */
export class AulaArchivadaError extends ErrorDeNegocio {
  constructor() {
    super('El aula está archivada: solo se puede consultar', 'CONFLICTO');
  }
}

/** Invariante del agregado Aula: máximo 45 matrículas activas. */
export class AulaLlenaError extends ErrorDeNegocio {
  constructor(maximo: number) {
    super(`El aula ya tiene ${maximo} estudiantes, que es el máximo`, 'CONFLICTO');
  }
}

export class EstudianteRepetidoEnAulaError extends ErrorDeNegocio {
  constructor() {
    super('Ya hay un estudiante con ese alias y avatar en el aula; cambia uno de los dos', 'CONFLICTO');
  }
}

export class DatoAsignacionInvalidoError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'VALIDACION');
  }
}

/** RF-018: la lectura o misión ya no está publicada (o nunca existió). */
export class ContenidoNoDisponibleError extends ErrorDeNegocio {
  constructor(tipo: 'LECTURA' | 'MISION') {
    super(tipo === 'LECTURA' ? 'Esa lectura no está disponible para asignar' : 'Esa misión no está disponible para asignar', 'NO_ENCONTRADO');
  }
}

/** RF-018: no se repite una lectura o misión que el aula ya tiene programada o en curso. */
export class AsignacionDuplicadaError extends ErrorDeNegocio {
  constructor() {
    super('El aula ya tiene esa lectura o misión asignada y vigente', 'CONFLICTO');
  }
}

/**
 * RF-019: código inexistente, vencido o ya usado. Un solo mensaje para todos los casos, para no
 * revelar qué códigos existen.
 */
export class InvitacionInvalidaError extends ErrorDeNegocio {
  constructor() {
    super('El código no es válido o ya venció. Pide uno nuevo a la docente del aula.', 'VALIDACION');
  }
}

export class DemasiadasInvitacionesError extends ErrorDeNegocio {
  constructor(maximo: number) {
    super(`Ya hay ${maximo} códigos de invitación sin usar para este estudiante. Espera a que se usen o venzan.`, 'CONFLICTO');
  }
}

/** SRS §7: hasta 2 familiares vinculados por estudiante (además del responsable principal). */
export class FamiliaCompletaError extends ErrorDeNegocio {
  constructor(alias: string, maximo: number) {
    super(`${alias} ya tiene ${maximo} familiares vinculados`, 'CONFLICTO');
  }
}

/** RF-076: una institución suspendida ya no se elige para aulas nuevas. */
export class InstitucionSuspendidaError extends ErrorDeNegocio {
  constructor(nombre: string) {
    super(`La institución «${nombre}» está suspendida en LectoAventura. Comunícate con la administración.`, 'CONFLICTO');
  }
}

/** RF-076: el aula de un docente suspendido queda en solo lectura (los niños siguen leyendo). */
export class AulaSoloLecturaError extends ErrorDeNegocio {
  constructor() {
    super('Esta aula está en solo lectura por ahora: no se pueden hacer cambios. Comunícate con el colegio.', 'CONFLICTO');
  }
}

export class InstitucionInvalidaError extends ErrorDeNegocio {
  constructor(mensaje: string) {
    super(mensaje, 'VALIDACION');
  }
}

export class InstitucionRepetidaError extends ErrorDeNegocio {
  constructor(campo: 'nombre' | 'código modular') {
    super(`Ya hay una institución registrada con ese ${campo}`, 'CONFLICTO');
  }
}
