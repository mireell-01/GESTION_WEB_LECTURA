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

export class CodigoAulaInvalidoError extends ErrorDeNegocio {
  constructor() {
    super('Ese código de aula no existe o el aula ya no está activa', 'NO_ENCONTRADO');
  }
}
