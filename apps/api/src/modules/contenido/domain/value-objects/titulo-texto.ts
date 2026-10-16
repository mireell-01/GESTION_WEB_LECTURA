/**
 * Value Object: TituloTexto — capa de dominio.
 */
export class TituloTexto {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): TituloTexto {
    // TODO: validar reglas del value object
    return new TituloTexto(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
