import { EmailInvalidoError } from '../errors/email-invalido-error';

/**
 * Value Object: Email — normalizado (minúsculas, sin espacios) y validado.
 */
export class Email {
  private constructor(private readonly valor: string) {}

  static de(valor: string): Email {
    const limpio = valor.trim().toLowerCase();
    const esValido = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(limpio);
    if (!esValido) {
      throw new EmailInvalidoError(valor);
    }
    return new Email(limpio);
  }

  static desdePersistencia(valor: string): Email {
    return new Email(valor);
  }

  get value(): string {
    return this.valor;
  }

  igualA(otro: Email): boolean {
    return this.valor === otro.valor;
  }
}
