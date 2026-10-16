/**
 * Entity: Pregunta — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface PreguntaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Pregunta {
  private constructor(private readonly props: PreguntaProps) {}

  static crear(props: PreguntaProps): Pregunta {
    // TODO: validar invariantes de negocio
    return new Pregunta(props);
  }
}
