/**
 * Value Object: FormatoRecurso — capa de dominio.
 */
export class FormatoRecurso {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): FormatoRecurso {
    // TODO: validar reglas del value object
    return new FormatoRecurso(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
