/**
 * Value Object: Tono — capa de dominio.
 */
export class Tono {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): Tono {
    // TODO: validar reglas del value object
    return new Tono(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
