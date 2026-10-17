import { InvitacionInvalidaError } from '../errors/errores-escuela';

/** RF-019: el código vence a los 7 días. */
export const VIGENCIA_INVITACION_DIAS = 7;
/** Códigos sin usar que puede tener un estudiante a la vez (uno por familiar y uno de repuesto). */
export const MAX_INVITACIONES_PENDIENTES = 3;

export interface InvitacionFamiliarProps {
  id: string;
  aulaId: string;
  estudianteId: string;
  docenteId: string;
  /** Solo la huella SHA-256 del código; el código en claro lo ve una sola vez la docente. */
  hashCodigo: string;
  expiraEn: Date;
  usadaEn: Date | null;
  cuentaFamiliarId: string | null;
  creadaEn: Date;
}

/**
 * Entidad: InvitacionFamiliar (RF-019) — código de un solo uso con el que la docente vincula a un
 * familiar con un estudiante de su aula. Vence a los 7 días.
 */
export class InvitacionFamiliar {
  private constructor(private readonly props: InvitacionFamiliarProps) {}

  static emitir(params: {
    id: string;
    aulaId: string;
    estudianteId: string;
    docenteId: string;
    hashCodigo: string;
    ahora: Date;
  }): InvitacionFamiliar {
    return new InvitacionFamiliar({
      id: params.id,
      aulaId: params.aulaId,
      estudianteId: params.estudianteId,
      docenteId: params.docenteId,
      hashCodigo: params.hashCodigo,
      expiraEn: new Date(params.ahora.getTime() + VIGENCIA_INVITACION_DIAS * 24 * 60 * 60 * 1000),
      usadaEn: null,
      cuentaFamiliarId: null,
      creadaEn: params.ahora,
    });
  }

  static desdePersistencia(props: InvitacionFamiliarProps): InvitacionFamiliar {
    return new InvitacionFamiliar(props);
  }

  get id(): string {
    return this.props.id;
  }

  get aulaId(): string {
    return this.props.aulaId;
  }

  get estudianteId(): string {
    return this.props.estudianteId;
  }

  get docenteId(): string {
    return this.props.docenteId;
  }

  get expiraEn(): Date {
    return this.props.expiraEn;
  }

  get propsSnapshot(): Readonly<InvitacionFamiliarProps> {
    return this.props;
  }

  estaVigente(ahora: Date): boolean {
    return !this.props.usadaEn && ahora < this.props.expiraEn;
  }

  /** Un solo uso: queda registrada la cuenta que la canjeó y cuándo. */
  canjear(cuentaFamiliarId: string, ahora: Date): void {
    if (!this.estaVigente(ahora)) throw new InvitacionInvalidaError();
    this.props.usadaEn = ahora;
    this.props.cuentaFamiliarId = cuentaFamiliarId;
  }
}
