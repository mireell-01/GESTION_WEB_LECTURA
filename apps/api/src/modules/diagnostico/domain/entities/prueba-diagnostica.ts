/**
 * Entity: PruebaDiagnostica — capa de dominio (sin dependencias externas).
 * 1. dominio · 2. aplicación · 3. infraestructura · 4. interface
 */
export interface PruebaDiagnosticaProps {
  // TODO: definir atributos inmutables de la entidad
}

export class PruebaDiagnostica {
  private constructor(private readonly props: PruebaDiagnosticaProps) {}

  static crear(props: PruebaDiagnosticaProps): PruebaDiagnostica {
    // TODO: validar invariantes de negocio
    return new PruebaDiagnostica(props);
  }
}
