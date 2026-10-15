/**
 * Value Object: ValorConfigurado — capa de dominio.
 */
export class ValorConfigurado {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): ValorConfigurado {
    // TODO: validar reglas del value object
    return new ValorConfigurado(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
