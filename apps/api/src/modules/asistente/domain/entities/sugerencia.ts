/**
 * Entity: Sugerencia — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface SugerenciaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Sugerencia {
  private constructor(private readonly props: SugerenciaProps) {}

  static crear(props: SugerenciaProps): Sugerencia {
    // TODO: validar invariantes de negocio
    return new Sugerencia(props);
  }
}
