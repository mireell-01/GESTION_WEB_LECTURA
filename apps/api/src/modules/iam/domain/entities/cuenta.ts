import { Email } from '../value-objects/email';
import { EstadoCuenta } from '../value-objects/estado-cuenta';
import { Rol } from '../value-objects/rol';
import { Contrasena } from '../value-objects/contrasena';
import { DatoInvalidoError } from '../errors/errores-iam';

export interface CuentaProps {
  id: string;
  nombre: string;
  email: Email;
  hashContrasena: string;
  rol: Rol;
  estado: EstadoCuenta;
  mfaHabilitado: boolean;
  mfaSecret: string | null;
  /** Secreto TOTP generado pero aún no confirmado con un código (RF-011). */
  mfaSecretPendiente: string | null;
  creadoEn: Date;
}

/**
 * Agregado: CuentaAdulta — docente, familiar, editor, revisor o administrador.
 * Nace en PENDIENTE_VERIFICACION (RF-001) y pasa a ACTIVA al verificar el correo (RF-002).
 */
export class Cuenta {
  private constructor(private readonly props: CuentaProps) {}

  static registrar(params: {
    id: string;
    nombre: string;
    email: Email;
    contrasena: Contrasena;
    rol: Rol;
    hashContrasena: string;
    ahora: Date;
  }): Cuenta {
    if (!params.rol.esAdulto()) {
      throw new DatoInvalidoError('Solo los roles adultos pueden registrarse con contraseña');
    }
    const nombre = params.nombre.trim();
    if (nombre.length < 2) {
      throw new DatoInvalidoError('Escribe tu nombre');
    }
    return new Cuenta({
      id: params.id,
      nombre,
      email: params.email,
      hashContrasena: params.hashContrasena,
      rol: params.rol,
      estado: EstadoCuenta.pendiente(),
      mfaHabilitado: false,
      mfaSecret: null,
      mfaSecretPendiente: null,
      creadoEn: params.ahora,
    });
  }

  static desdePersistencia(props: CuentaProps): Cuenta {
    return new Cuenta(props);
  }

  get id(): string {
    return this.props.id;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get email(): Email {
    return this.props.email;
  }

  get hashContrasena(): string {
    return this.props.hashContrasena;
  }

  get rol(): Rol {
    return this.props.rol;
  }

  get estado(): EstadoCuenta {
    return this.props.estado;
  }

  get mfaHabilitado(): boolean {
    return this.props.mfaHabilitado;
  }

  get mfaSecret(): string | null {
    return this.props.mfaSecret;
  }

  get mfaSecretPendiente(): string | null {
    return this.props.mfaSecretPendiente;
  }

  get propsSnapshot(): Readonly<CuentaProps> {
    return this.props;
  }

  estaActiva(): boolean {
    return this.props.estado.esActiva();
  }

  estaSuspendida(): boolean {
    return this.props.estado.esSuspendida();
  }

  verificar(): void {
    if (this.props.estado.value === 'PENDIENTE_VERIFICACION') {
      this.props.estado = EstadoCuenta.activa();
    }
  }

  /** RF-076: el docente suspendido pierde acceso inmediato. */
  suspender(): void {
    this.props.estado = EstadoCuenta.suspendida();
  }

  reactivar(): void {
    this.props.estado = EstadoCuenta.activa();
  }

  cambiarContrasena(hashContrasena: string): void {
    this.props.hashContrasena = hashContrasena;
  }

  /** RF-011 paso 1: guarda el secreto TOTP pendiente de confirmación. */
  iniciarMfa(secreto: string): void {
    this.props.mfaSecretPendiente = secreto;
  }

  /** RF-011 paso 2: el código de la app autenticadora fue correcto; se activa MFA. */
  confirmarMfa(): void {
    if (!this.props.mfaSecretPendiente) {
      throw new DatoInvalidoError('Primero genera el código QR de configuración');
    }
    this.props.mfaSecret = this.props.mfaSecretPendiente;
    this.props.mfaSecretPendiente = null;
    this.props.mfaHabilitado = true;
  }
}
