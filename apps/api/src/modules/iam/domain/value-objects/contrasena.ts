import { ContrasenaInvalidaError } from '../errors/contrasena-invalida-error';

/** Longitud mínima exigida por RF-001. */
export const LONGITUD_MINIMA_CONTRASENA = 10;

/**
 * Value Object: Contrasena — candidato en claro validado en longitud.
 * El hashing nunca ocurre aquí (responsabilidad del adaptador de cripto en infrastructure).
 * La comprobación de contraseñas filtradas vive en PoliticaContrasena (dominio).
 */
export class Contrasena {
  private constructor(private readonly valor: string) {}

  static de(valor: string): Contrasena {
    if (valor.length < LONGITUD_MINIMA_CONTRASENA) {
      throw new ContrasenaInvalidaError(
        `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`,
      );
    }
    return new Contrasena(valor);
  }

  get value(): string {
    return this.valor;
  }
}
