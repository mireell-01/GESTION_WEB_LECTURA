import { CodigoUnUso } from '../value-objects/codigo-un-uso';

/** Vigencia del enlace de verificación de correo (RF-002): 24 horas. */
export const VIGENCIA_VERIFICACION_H = 24;
/** Vigencia del enlace de recuperación de contraseña (RF-004): 30 minutos. */
export const VIGENCIA_RECUPERACION_MIN = 30;

export type TipoVerificacion = 'CORREO' | 'RECUPERACION_CONTRASENA';

/** En qué situación está un enlace en un momento dado (para mostrar mensajes claros). */
export type EstadoEnlace = 'VIGENTE' | 'USADO' | 'VENCIDO' | 'REEMPLAZADO';

/**
 * Entity: VerificacionCorreo — enlace de un solo uso para verificar correo (RF-002)
 * o recuperar contraseña (RF-004). Vigencia configurable por tipo. Al pedir un enlace
 * nuevo, los anteriores quedan reemplazados y dejan de servir.
 */
export interface VerificacionCorreoProps {
  id: string;
  cuentaId: string;
  tipo: TipoVerificacion;
  codigo: CodigoUnUso;
  creadoEn: Date;
  reemplazadoEn: Date | null;
}

export class VerificacionCorreo {
  private constructor(private readonly props: VerificacionCorreoProps) {}

  static paraVerificacionCorreo(params: {
    id: string;
    cuentaId: string;
    codigo: string;
    ahora: Date;
  }): VerificacionCorreo {
    const expiraEn = new Date(
      params.ahora.getTime() + VIGENCIA_VERIFICACION_H * 3_600_000,
    );
    return new VerificacionCorreo({
      id: params.id,
      cuentaId: params.cuentaId,
      tipo: 'CORREO',
      codigo: CodigoUnUso.crear(params.codigo, expiraEn),
      creadoEn: params.ahora,
      reemplazadoEn: null,
    });
  }

  static paraRecuperacionContrasena(params: {
    id: string;
    cuentaId: string;
    codigo: string;
    ahora: Date;
  }): VerificacionCorreo {
    const expiraEn = new Date(
      params.ahora.getTime() + VIGENCIA_RECUPERACION_MIN * 60_000,
    );
    return new VerificacionCorreo({
      id: params.id,
      cuentaId: params.cuentaId,
      tipo: 'RECUPERACION_CONTRASENA',
      codigo: CodigoUnUso.crear(params.codigo, expiraEn),
      creadoEn: params.ahora,
      reemplazadoEn: null,
    });
  }

  static desdePersistencia(
    props: VerificacionCorreoProps,
    codigo: CodigoUnUso,
  ): VerificacionCorreo {
    return new VerificacionCorreo({ ...props, codigo });
  }

  get id(): string {
    return this.props.id;
  }

  get cuentaId(): string {
    return this.props.cuentaId;
  }

  get tipo(): TipoVerificacion {
    return this.props.tipo;
  }

  get codigo(): CodigoUnUso {
    return this.props.codigo;
  }

  get creadoEn(): Date {
    return this.props.creadoEn;
  }

  get reemplazadoEn(): Date | null {
    return this.props.reemplazadoEn;
  }

  estadoEn(ahora: Date): EstadoEnlace {
    if (this.props.codigo.yaCanjeado) return 'USADO';
    if (this.props.reemplazadoEn) return 'REEMPLAZADO';
    if (ahora.getTime() > this.props.codigo.expira.getTime()) return 'VENCIDO';
    return 'VIGENTE';
  }

  /** Canjea el código; devuelve false si ya fue usado, venció o fue reemplazado (RF-002/RF-004). */
  canjear(ahora: Date): boolean {
    if (this.props.reemplazadoEn) return false;
    return this.props.codigo.canjear(ahora);
  }

  estaVigente(ahora: Date): boolean {
    return this.estadoEn(ahora) === 'VIGENTE';
  }

  /** Un enlace más nuevo lo deja sin efecto (solo si aún no se usó). */
  reemplazar(ahora: Date): void {
    if (!this.props.codigo.yaCanjeado && !this.props.reemplazadoEn) this.props.reemplazadoEn = ahora;
  }
}
