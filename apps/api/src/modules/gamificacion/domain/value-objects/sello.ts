/**
 * Value Object: Sello — capa de dominio.
 */
export class Sello {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): Sello {
    // TODO: validar reglas del value object
    return new Sello(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
