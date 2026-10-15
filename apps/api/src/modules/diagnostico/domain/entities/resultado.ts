/**
 * Entity: Resultado — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface ResultadoProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Resultado {
  private constructor(private readonly props: ResultadoProps) {}

  static crear(props: ResultadoProps): Resultado {
    // TODO: validar invariantes de negocio
    return new Resultado(props);
  }
}
