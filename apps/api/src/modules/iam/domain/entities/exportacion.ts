/** RF-012: los archivos quedan disponibles por enlace firmado durante 72 h. */
export const VIGENCIA_EXPORTACION_H = 72;

export const FORMATOS_EXPORTACION = ['json', 'pdf'] as const;
export type FormatoExportacion = (typeof FORMATOS_EXPORTACION)[number];

export interface ExportacionProps {
  id: string;
  perfilId: string;
  /** Adulto responsable que la solicitó (auditoría). */
  solicitadaPor: string;
  creadaEn: Date;
  expiraEn: Date;
}

/**
 * Entidad: Exportacion — copia de los datos personales y de progreso de un estudiante (RF-012,
 * derecho de acceso ARCO), en JSON y PDF, descargable solo con enlace firmado hasta `expiraEn`.
 */
export class Exportacion {
  private constructor(private readonly props: ExportacionProps) {}

  static solicitar(params: { id: string; perfilId: string; solicitadaPor: string; ahora: Date }): Exportacion {
    return new Exportacion({
      id: params.id,
      perfilId: params.perfilId,
      solicitadaPor: params.solicitadaPor,
      creadaEn: params.ahora,
      expiraEn: new Date(params.ahora.getTime() + VIGENCIA_EXPORTACION_H * 3_600_000),
    });
  }

  static desdePersistencia(props: ExportacionProps): Exportacion {
    return new Exportacion(props);
  }

  get id(): string {
    return this.props.id;
  }

  get expiraEn(): Date {
    return this.props.expiraEn;
  }

  get propsSnapshot(): Readonly<ExportacionProps> {
    return this.props;
  }

  estaVigente(ahora: Date): boolean {
    return ahora.getTime() <= this.props.expiraEn.getTime();
  }
}
