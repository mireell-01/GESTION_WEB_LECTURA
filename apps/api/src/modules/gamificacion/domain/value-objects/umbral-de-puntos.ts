/**
 * Value Object: UmbralDePuntos — capa de dominio.
 */
export class UmbralDePuntos {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): UmbralDePuntos {
    // TODO: validar reglas del value object
    return new UmbralDePuntos(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
