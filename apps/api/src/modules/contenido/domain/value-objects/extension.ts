/**
 * Value Object: Extension — capa de dominio.
 */
export class Extension {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): Extension {
    // TODO: validar reglas del value object
    return new Extension(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
