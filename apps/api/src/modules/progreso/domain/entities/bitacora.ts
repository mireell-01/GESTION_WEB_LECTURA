/**
 * Entity: Bitacora — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface BitacoraProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Bitacora {
  private constructor(private readonly props: BitacoraProps) {}

  static crear(props: BitacoraProps): Bitacora {
    // TODO: validar invariantes de negocio
    return new Bitacora(props);
  }
}
