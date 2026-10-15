/**
 * Value Object: BandaDeDesempeno — capa de dominio.
 */
export class BandaDeDesempeno {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): BandaDeDesempeno {
    // TODO: validar reglas del value object
    return new BandaDeDesempeno(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
