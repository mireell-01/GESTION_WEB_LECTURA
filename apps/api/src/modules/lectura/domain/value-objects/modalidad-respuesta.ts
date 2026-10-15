/**
 * Value Object: ModalidadRespuesta — capa de dominio.
 */
export class ModalidadRespuesta {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): ModalidadRespuesta {
    // TODO: validar reglas del value object
    return new ModalidadRespuesta(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
