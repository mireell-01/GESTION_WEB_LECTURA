import { PinInvalidoError } from '../errors/pin-invalido-error';

/** PIN fáciles de adivinar que el SRS (§6, VO `Pin`) prohíbe. */
const PINES_TRIVIALES = new Set([
  ...Array.from({ length: 10 }, (_, d) => String(d).repeat(4)),
  '1234',
  '4321',
]);

/**
 * Value Object: Pin — 4 dígitos; rechaza 0000…9999 repetidos, 1234, 4321
 * y el año de nacimiento del perfil (R-10: PIN adivinado entre compañeros).
 */
export class Pin {
  private constructor(private readonly valor: string) {}

  static de(valor: string, anioNacimiento?: number): Pin {
    if (!/^\d{4}$/.test(valor)) {
      throw new PinInvalidoError('El PIN debe tener exactamente 4 números');
    }
    if (PINES_TRIVIALES.has(valor) || (anioNacimiento !== undefined && valor === String(anioNacimiento))) {
      throw new PinInvalidoError('Ese PIN es muy fácil de adivinar; elige otro');
    }
    return new Pin(valor);
  }

  get value(): string {
    return this.valor;
  }
}
