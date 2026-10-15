/**
 * Value Object: Dificultad — capa de dominio.
 */
export class Dificultad {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): Dificultad {
    // TODO: validar reglas del value object
    return new Dificultad(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
