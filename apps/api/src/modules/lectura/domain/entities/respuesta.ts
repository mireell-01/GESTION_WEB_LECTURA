/**
 * Entity: Respuesta — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface RespuestaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Respuesta {
  private constructor(private readonly props: RespuestaProps) {}

  static crear(props: RespuestaProps): Respuesta {
    // TODO: validar invariantes de negocio
    return new Respuesta(props);
  }
}
