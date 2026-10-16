/**
 * Entity: Progreso — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface ProgresoProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Progreso {
  private constructor(private readonly props: ProgresoProps) {}

  static crear(props: ProgresoProps): Progreso {
    // TODO: validar invariantes de negocio
    return new Progreso(props);
  }
}
