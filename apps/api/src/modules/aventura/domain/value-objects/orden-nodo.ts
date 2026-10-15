/**
 * Value Object: OrdenNodo — capa de dominio.
 */
export class OrdenNodo {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): OrdenNodo {
    // TODO: validar reglas del value object
    return new OrdenNodo(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
