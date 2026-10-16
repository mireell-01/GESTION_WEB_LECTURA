import { RangoEdad } from '../../../shared-kernel/public-api';
import { AnioMesNacimiento } from '../value-objects/anio-mes-nacimiento';
import { PerfilBloqueadoError } from '../errors/perfil-bloqueado-error';
import { DatoInvalidoError } from '../errors/errores-iam';

export const MAX_INTENTOS_PIN = 5;
export const DURACION_BLOQUEO_MIN = 15;

/** Avatares ilustrados disponibles: nunca una foto real del menor (RN-02). */
export const AVATARES = [
  'zorro',
  'panda',
  'leon',
  'rana',
  'pulpo',
  'buho',
  'tortuga',
  'unicornio',
  'abeja',
  'delfin',
  'tigre',
  'koala',
] as const;

export interface PerfilEstudianteProps {
  id: string;
  cuentaResponsableId: string;
  consentimientoId: string;
  alias: string;
  anioMesNacimiento: AnioMesNacimiento;
  avatar: string;
  hashPin: string;
  intentosFallidos: number;
  bloqueadoHasta: Date | null;
  activo: boolean;
  eliminadoEn: Date | null;
  creadoEn: Date;
}

function validarAlias(alias: string): string {
  const limpio = alias.trim().replace(/\s+/g, ' ');
  if (limpio.length < 2 || limpio.length > 20) {
    throw new DatoInvalidoError('El alias debe tener entre 2 y 20 caracteres');
  }
  if (/[@\d]{5,}|@/.test(limpio)) {
    throw new DatoInvalidoError('El alias no puede incluir correos ni números largos');
  }
  return limpio;
}

function validarAvatar(avatar: string): string {
  if (!(AVATARES as readonly string[]).includes(avatar)) {
    throw new DatoInvalidoError('Elige uno de los avatares disponibles');
  }
  return avatar;
}

/**
 * Agregado: PerfilEstudiante — identidad mínima del niño (RN-02): alias, año-mes de nacimiento,
 * avatar y hash del PIN. Siempre tiene un responsable y un consentimiento (RN-01).
 */
export class PerfilEstudiante {
  private constructor(private readonly props: PerfilEstudianteProps) {}

  static crear(params: {
    id: string;
    cuentaResponsableId: string;
    consentimientoId: string;
    alias: string;
    anioMesNacimiento: AnioMesNacimiento;
    avatar: string;
    hashPin: string;
    ahora: Date;
  }): PerfilEstudiante {
    return new PerfilEstudiante({
      id: params.id,
      cuentaResponsableId: params.cuentaResponsableId,
      consentimientoId: params.consentimientoId,
      alias: validarAlias(params.alias),
      anioMesNacimiento: params.anioMesNacimiento,
      avatar: validarAvatar(params.avatar),
      hashPin: params.hashPin,
      intentosFallidos: 0,
      bloqueadoHasta: null,
      activo: true,
      eliminadoEn: null,
      creadoEn: params.ahora,
    });
  }

  static desdePersistencia(props: PerfilEstudianteProps): PerfilEstudiante {
    return new PerfilEstudiante(props);
  }

  get id(): string {
    return this.props.id;
  }

  get cuentaResponsableId(): string {
    return this.props.cuentaResponsableId;
  }

  get alias(): string {
    return this.props.alias;
  }

  get avatar(): string {
    return this.props.avatar;
  }

  get hashPin(): string {
    return this.props.hashPin;
  }

  get bloqueadoHasta(): Date | null {
    return this.props.bloqueadoHasta;
  }

  get intentosFallidos(): number {
    return this.props.intentosFallidos;
  }

  get activo(): boolean {
    return this.props.activo && !this.props.eliminadoEn;
  }

  get propsSnapshot(): Readonly<PerfilEstudianteProps> {
    return this.props;
  }

  rangoEdad(ahora: Date): RangoEdad {
    return this.props.anioMesNacimiento.rangoEdad(ahora);
  }

  perteneceA(cuentaId: string): boolean {
    return this.props.cuentaResponsableId === cuentaId;
  }

  estaBloqueado(ahora: Date): boolean {
    const hasta = this.props.bloqueadoHasta;
    return !!hasta && ahora.getTime() < hasta.getTime();
  }

  asegurarNoBloqueado(ahora: Date): void {
    if (this.estaBloqueado(ahora)) {
      throw new PerfilBloqueadoError(this.props.bloqueadoHasta as Date);
    }
  }

  /** RN-03: 5 PIN incorrectos consecutivos bloquean el perfil 15 min. */
  registrarIntentoFallido(ahora: Date): void {
    this.props.intentosFallidos += 1;
    if (this.props.intentosFallidos >= MAX_INTENTOS_PIN) {
      this.props.bloqueadoHasta = new Date(ahora.getTime() + DURACION_BLOQUEO_MIN * 60_000);
      this.props.intentosFallidos = 0;
    }
  }

  registrarIntentoCorrecto(): void {
    this.props.intentosFallidos = 0;
    this.props.bloqueadoHasta = null;
  }

  restablecerPin(hashPin: string): void {
    this.props.hashPin = hashPin;
    this.props.intentosFallidos = 0;
    this.props.bloqueadoHasta = null;
  }

  actualizar(cambios: { alias?: string; avatar?: string }): void {
    if (cambios.alias !== undefined) this.props.alias = validarAlias(cambios.alias);
    if (cambios.avatar !== undefined) this.props.avatar = validarAvatar(cambios.avatar);
  }

  /** RF-071: el familiar puede desactivar un perfil (deja de aparecer al ingresar). */
  desactivar(): void {
    this.props.activo = false;
  }

  reactivar(): void {
    this.props.activo = true;
  }

  /**
   * RF-013: elimina los datos personales; las métricas se conservan anonimizadas
   * bajo el mismo id, que ya no puede asociarse a ninguna persona.
   */
  anonimizar(ahora: Date): void {
    this.props.alias = 'Perfil eliminado';
    this.props.avatar = 'eliminado';
    this.props.hashPin = '';
    this.props.activo = false;
    this.props.eliminadoEn = ahora;
  }
}
