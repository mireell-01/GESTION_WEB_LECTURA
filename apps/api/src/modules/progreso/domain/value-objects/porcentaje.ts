/**
 * Value Object: Porcentaje — capa de dominio.
 */
export class Porcentaje {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): Porcentaje {
    // TODO: validar reglas del value object
    return new Porcentaje(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
