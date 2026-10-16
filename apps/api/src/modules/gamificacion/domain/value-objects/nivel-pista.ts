/**
 * Value Object: NivelPista — capa de dominio.
 */
export class NivelPista {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): NivelPista {
    // TODO: validar reglas del value object
    return new NivelPista(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
