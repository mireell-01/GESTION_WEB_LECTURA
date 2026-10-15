/**
 * Value Object: NivelCNEB — capa de dominio.
 */
export class NivelCNEB {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): NivelCNEB {
    // TODO: validar reglas del value object
    return new NivelCNEB(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
