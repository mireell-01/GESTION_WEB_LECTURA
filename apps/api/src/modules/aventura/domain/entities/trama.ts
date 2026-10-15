/**
 * Entity: Trama — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface TramaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Trama {
  private constructor(private readonly props: TramaProps) {}

  static crear(props: TramaProps): Trama {
    // TODO: validar invariantes de negocio
    return new Trama(props);
  }
}
