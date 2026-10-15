/**
 * Value Object: ExtensionTexto — capa de dominio.
 */
export class ExtensionTexto {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): ExtensionTexto {
    // TODO: validar reglas del value object
    return new ExtensionTexto(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
