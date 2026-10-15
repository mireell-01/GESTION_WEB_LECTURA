/**
 * Value Object: MapaAventura — capa de dominio.
 */
export class MapaAventura {
  private constructor(private readonly valor: unknown) {}

  static de(valor: unknown): MapaAventura {
    // TODO: validar reglas del value object
    return new MapaAventura(valor);
  }

  get value(): unknown {
    return this.valor;
  }
}
