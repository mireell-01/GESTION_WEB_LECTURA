/**
 * Entity: Racha — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface RachaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Racha {
  private constructor(private readonly props: RachaProps) {}

  static crear(props: RachaProps): Racha {
    // TODO: validar invariantes de negocio
    return new Racha(props);
  }
}
