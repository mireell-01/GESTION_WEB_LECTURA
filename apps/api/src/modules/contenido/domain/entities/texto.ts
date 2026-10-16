/**
 * Entity: Texto — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface TextoProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Texto {
  private constructor(private readonly props: TextoProps) {}

  static crear(props: TextoProps): Texto {
    // TODO: validar invariantes de negocio
    return new Texto(props);
  }
}
