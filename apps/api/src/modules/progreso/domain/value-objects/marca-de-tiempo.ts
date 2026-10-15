/**
 * Value Object: MarcaDeTiempo — capa de dominio.
 */
export class MarcaDeTiempo {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): MarcaDeTiempo {
    // TODO: validar reglas del value object
    return new MarcaDeTiempo(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
