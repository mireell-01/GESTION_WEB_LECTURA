/**
 * Value Object: Habilidad — capa de dominio.
 */
export class Habilidad {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): Habilidad {
    // TODO: validar reglas del value object
    return new Habilidad(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
