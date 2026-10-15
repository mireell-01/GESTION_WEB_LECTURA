/**
 * Entity: Puntaje — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface PuntajeProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Puntaje {
  private constructor(private readonly props: PuntajeProps) {}

  static crear(props: PuntajeProps): Puntaje {
    // TODO: validar invariantes de negocio
    return new Puntaje(props);
  }
}
