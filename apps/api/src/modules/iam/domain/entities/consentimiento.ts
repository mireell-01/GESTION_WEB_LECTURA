import { DatoInvalidoError } from '../errors/errores-iam';

export type MedioConsentimiento = 'DIGITAL' | 'FISICO';

/** PARENTAL: familia o estudiante independiente · INSTITUCIONAL: aula de una IE (RN-01). */
export type TipoConsentimiento = 'PARENTAL' | 'INSTITUCIONAL';

/** Versión vigente de la política de privacidad que el adulto acepta. */
export const VERSION_POLITICA_VIGENTE = '2026-09';

export interface ConsentimientoProps {
  id: string;
  cuentaResponsableId: string;
  tipo: TipoConsentimiento;
  /** Aula a la que aplica el consentimiento institucional. */
  aulaId: string | null;
  versionPolitica: string;
  otorgadoEn: Date;
  otorganteNombre: string;
  medio: MedioConsentimiento;
  vigente: boolean;
}

/**
 * Agregado: Consentimiento — registro verificable del consentimiento (RF-005).
 * Conserva versión de política, fecha, otorgante y medio.
 */
export class Consentimiento {
  private constructor(private readonly props: ConsentimientoProps) {}

  static otorgar(params: {
    id: string;
    cuentaResponsableId: string;
    tipo: TipoConsentimiento;
    aulaId?: string | null;
    versionPolitica: string;
    otorganteNombre: string;
    medio: MedioConsentimiento;
    ahora: Date;
  }): Consentimiento {
    const otorgante = params.otorganteNombre.trim();
    if (otorgante.length < 3) {
      throw new DatoInvalidoError('Escribe el nombre completo de quien otorga el consentimiento');
    }
    if (params.tipo === 'INSTITUCIONAL' && !params.aulaId) {
      throw new DatoInvalidoError('El consentimiento institucional debe indicar el aula');
    }
    return new Consentimiento({
      id: params.id,
      cuentaResponsableId: params.cuentaResponsableId,
      tipo: params.tipo,
      aulaId: params.aulaId ?? null,
      versionPolitica: params.versionPolitica,
      otorgadoEn: params.ahora,
      otorganteNombre: otorgante,
      medio: params.medio,
      vigente: true,
    });
  }

  static desdePersistencia(props: ConsentimientoProps): Consentimiento {
    return new Consentimiento(props);
  }

  get id(): string {
    return this.props.id;
  }

  get cuentaResponsableId(): string {
    return this.props.cuentaResponsableId;
  }

  get tipo(): TipoConsentimiento {
    return this.props.tipo;
  }

  get aulaId(): string | null {
    return this.props.aulaId;
  }

  get versionPolitica(): string {
    return this.props.versionPolitica;
  }

  get otorgadoEn(): Date {
    return this.props.otorgadoEn;
  }

  get otorganteNombre(): string {
    return this.props.otorganteNombre;
  }

  get medio(): MedioConsentimiento {
    return this.props.medio;
  }

  get vigente(): boolean {
    return this.props.vigente;
  }

  get propsSnapshot(): Readonly<ConsentimientoProps> {
    return this.props;
  }

  revocar(): void {
    this.props.vigente = false;
  }
}
