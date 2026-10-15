/**
 * Entity: Insignia — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface InsigniaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Insignia {
  private constructor(private readonly props: InsigniaProps) {}

  static crear(props: InsigniaProps): Insignia {
    // TODO: validar invariantes de negocio
    return new Insignia(props);
  }
}
