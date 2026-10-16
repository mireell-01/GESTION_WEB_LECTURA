/**
 * Entity: Categoria — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface CategoriaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Categoria {
  private constructor(private readonly props: CategoriaProps) {}

  static crear(props: CategoriaProps): Categoria {
    // TODO: validar invariantes de negocio
    return new Categoria(props);
  }
}
