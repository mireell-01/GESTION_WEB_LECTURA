/**
 * Entity: Auditoria — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface AuditoriaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Auditoria {
  private constructor(private readonly props: AuditoriaProps) {}

  static crear(props: AuditoriaProps): Auditoria {
    // TODO: validar invariantes de negocio
    return new Auditoria(props);
  }
}
