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
  /** Ingreso con Google (solo docentes y familias): el identificador estable (sub) de su cuenta de Google. */
  googleSub: string | null;
}

/** Los roles que pueden ingresar con Google: el equipo de contenidos y la administración usan contraseña y MFA. */
const ROLES_CON_GOOGLE = new Set(['DOCENTE', 'FAMILIAR']);

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
      googleSub: null,
    });
  }

  /**
   * Una docente o un familiar crea su cuenta con Google: Google ya confirmó el correo, así que la cuenta nace
   * ACTIVA y vinculada. La contraseña es una clave al azar que nadie conoce; si algún día quiere ingresar
   * con contraseña, la crea con "¿Olvidaste tu contraseña?" (RF-004).
   */
  static registrarConGoogle(params: {
    id: string;
    nombre: string;
    email: Email;
    rol: Rol;
    hashContrasena: string;
    googleSub: string;
    ahora: Date;
  }): Cuenta {
    if (!ROLES_CON_GOOGLE.has(params.rol.value)) {
      throw new DatoInvalidoError('Con Google solo pueden registrarse docentes y familias');
    }
    const nombre = params.nombre.trim();
    if (nombre.length < 2) {
      throw new DatoInvalidoError('Escribe tu nombre');
    }
    if (!params.googleSub.trim()) {
      throw new DatoInvalidoError('Falta la cuenta de Google');
    }
    return new Cuenta({
      id: params.id,
      nombre,
      email: params.email,
      hashContrasena: params.hashContrasena,
      rol: params.rol,
      estado: EstadoCuenta.activa(),
      mfaHabilitado: false,
      mfaSecret: null,
      mfaSecretPendiente: null,
      creadoEn: params.ahora,
      googleSub: params.googleSub,
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

  get googleSub(): string | null {
    return this.props.googleSub;
  }

  /**
   * Ingresar o vincular con Google: solo docentes y familias, y sin verificación en dos pasos (quien la activó
   * sigue entrando con contraseña y código, para no saltarse ese segundo factor).
   */
  puedeUsarGoogle(): boolean {
    return ROLES_CON_GOOGLE.has(this.props.rol.value) && !this.props.mfaHabilitado;
  }

  /** Vincula su cuenta de Google. Si la cuenta esperaba verificar el correo, Google ya lo confirmó. */
  vincularGoogle(googleSub: string): void {
    if (!this.puedeUsarGoogle()) {
      throw new DatoInvalidoError('Esta cuenta ingresa con contraseña y código de verificación');
    }
    if (!googleSub.trim()) {
      throw new DatoInvalidoError('Falta la cuenta de Google');
    }
    this.props.googleSub = googleSub;
    this.verificar();
  }

  desvincularGoogle(): void {
    this.props.googleSub = null;
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
