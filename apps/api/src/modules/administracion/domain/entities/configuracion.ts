/**
 * Entity: Configuracion — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface ConfiguracionProps {
  // TODO: definir atributos inmutables de la entidad
}

export class Configuracion {
  private constructor(private readonly props: ConfiguracionProps) {}

  static crear(props: ConfiguracionProps): Configuracion {
    // TODO: validar invariantes de negocio
    return new Configuracion(props);
  }
}
