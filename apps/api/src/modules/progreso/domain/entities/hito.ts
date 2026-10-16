/**
 * Entity: Hito — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface HitoProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Hito {
  private constructor(private readonly props: HitoProps) {}

  static crear(props: HitoProps): Hito {
    // TODO: validar invariantes de negocio
    return new Hito(props);
  }
}
