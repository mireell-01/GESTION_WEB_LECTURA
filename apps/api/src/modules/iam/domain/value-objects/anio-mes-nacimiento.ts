import { edadEnAnios, RangoEdad, rangoEdadDe } from '../../../shared-kernel/public-api';
import { DatoInvalidoError } from '../errors/errores-iam';

export const EDAD_MINIMA = 5;
export const EDAD_MAXIMA = 13;

/**
 * Value Object: AnioMesNacimiento — único dato de edad que se guarda del menor (RN-02).
 * La edad resultante debe estar entre 5 y 13 años (SRS §6).
 */
export class AnioMesNacimiento {
  private constructor(
    readonly anio: number,
    readonly mes: number,
  ) {}

  static de(anio: number, mes: number, ahora: Date = new Date()): AnioMesNacimiento {
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      throw new DatoInvalidoError('El mes de nacimiento debe estar entre 1 y 12');
    }
    const edad = edadEnAnios(anio, mes, ahora);
    if (!Number.isInteger(anio) || edad < EDAD_MINIMA || edad > EDAD_MAXIMA) {
      throw new DatoInvalidoError(
        `La plataforma es para niñas y niños de ${EDAD_MINIMA} a ${EDAD_MAXIMA} años`,
      );
    }
    return new AnioMesNacimiento(anio, mes);
  }

  static desdePersistencia(anio: number, mes: number): AnioMesNacimiento {
    return new AnioMesNacimiento(anio, mes);
  }

  edad(ahora: Date): number {
    return edadEnAnios(this.anio, this.mes, ahora);
  }

  rangoEdad(ahora: Date): RangoEdad {
    return rangoEdadDe(this.edad(ahora));
  }
}
