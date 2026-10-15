import { PoliticaSesion } from '../services/politica-sesion';

export interface SesionProps {
  id: string;
  /** Cuenta adulta o perfil de estudiante dueño de la sesión. */
  sujetoId: string;
  rol: string;
  mfa: boolean;
  /** Huella SHA-256 del refresh token rotativo (nunca el valor en claro). */
  hashRefreshToken: string;
  creadaEn: Date;
  ultimaActividadEn: Date;
  revocadaEn: Date | null;
}

/** Cada cuánto se persiste la marca de actividad, para no escribir en cada petición. */
const INTERVALO_REGISTRO_ACTIVIDAD_MS = 60_000;

/**
 * Entidad: SesionAutenticacion — controla el refresh token y la expiración por inactividad
 * (RF-003, RF-010): estudiante 10 min, adulto 30 min.
 */
export class Sesion {
  private constructor(private readonly props: SesionProps) {}

  static abrir(params: {
    id: string;
    sujetoId: string;
    rol: string;
    mfa: boolean;
    hashRefreshToken: string;
    ahora: Date;
  }): Sesion {
    return new Sesion({
      id: params.id,
      sujetoId: params.sujetoId,
      rol: params.rol,
      mfa: params.mfa,
      hashRefreshToken: params.hashRefreshToken,
      creadaEn: params.ahora,
      ultimaActividadEn: params.ahora,
      revocadaEn: null,
    });
  }

  static desdePersistencia(props: SesionProps): Sesion {
    return new Sesion(props);
  }

  get id(): string {
    return this.props.id;
  }

  get sujetoId(): string {
    return this.props.sujetoId;
  }

  get rol(): string {
    return this.props.rol;
  }

  get mfa(): boolean {
    return this.props.mfa;
  }

  get hashRefreshToken(): string {
    return this.props.hashRefreshToken;
  }

  get ultimaActividadEn(): Date {
    return this.props.ultimaActividadEn;
  }

  get revocadaEn(): Date | null {
    return this.props.revocadaEn;
  }

  get propsSnapshot(): Readonly<SesionProps> {
    return this.props;
  }

  /** ¿Sigue viva? No está revocada ni expiró por inactividad. */
  estaViva(ahora: Date): boolean {
    if (this.props.revocadaEn) return false;
    const limite = PoliticaSesion.expiracionPorInactividad(
      this.props.ultimaActividadEn,
      this.props.rol === 'ESTUDIANTE',
    );
    return ahora.getTime() <= limite.getTime();
  }

  /** Refresca la ventana de inactividad; devuelve true si conviene persistir el cambio. */
  registrarActividad(ahora: Date): boolean {
    const transcurrido = ahora.getTime() - this.props.ultimaActividadEn.getTime();
    if (transcurrido < INTERVALO_REGISTRO_ACTIVIDAD_MS) return false;
    this.props.ultimaActividadEn = ahora;
    return true;
  }

  /** RF-003: rota el refresh token; el anterior deja de servir. */
  rotarRefreshToken(hashNuevo: string, ahora: Date): void {
    this.props.hashRefreshToken = hashNuevo;
    this.props.ultimaActividadEn = ahora;
  }

  /** RF-011: tras confirmar MFA, la sesión queda marcada como verificada. */
  marcarMfaVerificado(): void {
    this.props.mfa = true;
  }

  revocar(ahora: Date): void {
    if (!this.props.revocadaEn) this.props.revocadaEn = ahora;
  }
}
