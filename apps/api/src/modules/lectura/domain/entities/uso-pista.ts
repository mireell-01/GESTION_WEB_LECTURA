/**
 * Entity: UsoPista — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface UsoPistaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class UsoPista {
  private constructor(private readonly props: UsoPistaProps) {}

  static crear(props: UsoPistaProps): UsoPista {
    // TODO: validar invariantes de negocio
    return new UsoPista(props);
  }
}
