/**
 * Entity: Recurso — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface RecursoProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Recurso {
  private constructor(private readonly props: RecursoProps) {}

  static crear(props: RecursoProps): Recurso {
    // TODO: validar invariantes de negocio
    return new Recurso(props);
  }
}
