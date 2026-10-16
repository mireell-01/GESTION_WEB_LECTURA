/**
 * Entity: SesionLectura — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface SesionLecturaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class SesionLectura {
  private constructor(private readonly props: SesionLecturaProps) {}

  static crear(props: SesionLecturaProps): SesionLectura {
    // TODO: validar invariantes de negocio
    return new SesionLectura(props);
  }
}
