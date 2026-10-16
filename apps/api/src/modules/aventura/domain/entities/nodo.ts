/**
 * Entity: Nodo — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface NodoProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Nodo {
  private constructor(private readonly props: NodoProps) {}

  static crear(props: NodoProps): Nodo {
    // TODO: validar invariantes de negocio
    return new Nodo(props);
  }
}
