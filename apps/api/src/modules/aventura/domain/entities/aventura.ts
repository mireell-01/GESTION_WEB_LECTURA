/**
 * Entity: Aventura — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface AventuraProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Aventura {
  private constructor(private readonly props: AventuraProps) {}

  static crear(props: AventuraProps): Aventura {
    // TODO: validar invariantes de negocio
    return new Aventura(props);
  }
}
