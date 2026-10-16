/**
 * Entity: Conversacion — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface ConversacionProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Conversacion {
  private constructor(private readonly props: ConversacionProps) {}

  static crear(props: ConversacionProps): Conversacion {
    // TODO: validar invariantes de negocio
    return new Conversacion(props);
  }
}
