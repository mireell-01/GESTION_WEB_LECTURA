/**
 * Value Object: RutaDeLectura — capa de dominio.
 */
export class RutaDeLectura {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): RutaDeLectura {
    // TODO: validar reglas del value object
    return new RutaDeLectura(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
