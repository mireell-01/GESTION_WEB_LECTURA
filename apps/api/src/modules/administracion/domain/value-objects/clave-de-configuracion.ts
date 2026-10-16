/**
 * Value Object: ClaveDeConfiguracion — capa de dominio.
 */
export class ClaveDeConfiguracion {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): ClaveDeConfiguracion {
    // TODO: validar reglas del value object
    return new ClaveDeConfiguracion(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
