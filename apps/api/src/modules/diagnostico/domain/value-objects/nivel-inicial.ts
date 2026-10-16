/**
 * Value Object: NivelInicial — capa de dominio.
 */
export class NivelInicial {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): NivelInicial {
    // TODO: validar reglas del value object
    return new NivelInicial(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
