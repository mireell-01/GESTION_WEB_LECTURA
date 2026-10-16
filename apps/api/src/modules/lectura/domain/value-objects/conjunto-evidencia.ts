/**
 * Value Object: ConjuntoEvidencia — capa de dominio.
 */
export class ConjuntoEvidencia {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): ConjuntoEvidencia {
    // TODO: validar reglas del value object
    return new ConjuntoEvidencia(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
