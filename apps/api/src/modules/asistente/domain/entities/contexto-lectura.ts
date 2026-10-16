/**
 * Entity: ContextoLectura — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface ContextoLecturaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class ContextoLectura {
  private constructor(private readonly props: ContextoLecturaProps) {}

  static crear(props: ContextoLecturaProps): ContextoLectura {
    // TODO: validar invariantes de negocio
    return new ContextoLectura(props);
  }
}
