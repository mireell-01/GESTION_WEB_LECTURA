import { RangoEdad } from '../../../shared-kernel/public-api';

/**
 * DTOs de entrada/salida de los casos de uso de IAM (capa de aplicación).
 * No son los DTO HTTP: esos viven en interface/dto con su validación.
 */

export type Reloj = () => Date;
export type GeneradorId = () => string;

/** Resultado de abrir o renovar una sesión. El refresh token viaja en cookie httpOnly. */
export interface SesionEmitida {
  accessToken: string;
  refreshToken: string;
  expiraEnMin: number;
  rol: string;
  rutaInicial: string;
  /** Rol administrativo que aún debe configurar MFA para entrar al backoffice (RF-011). */
  requiereConfigurarMfa: boolean;
}

export interface RegistrarCuentaInput {
  nombre: string;
  email: string;
  contrasena: string;
  rol: 'DOCENTE' | 'FAMILIAR';
}

export interface AutenticarAdultoInput {
  email: string;
  contrasena: string;
  codigoMfa?: string;
}

export interface CrearPerfilEstudianteInput {
  cuentaResponsableId: string;
  alias: string;
  anioNacimiento: number;
  mesNacimiento: number;
  avatar: string;
  pin: string;
  /** Si se indica, el perfil se crea bajo el consentimiento institucional de esa aula. */
  aulaId?: string;
}

/** Vista de un perfil para su responsable (nunca incluye el hash del PIN). */
export interface PerfilEstudianteVista {
  id: string;
  alias: string;
  avatar: string;
  anioNacimiento: number;
  mesNacimiento: number;
  rangoEdad: RangoEdad;
  activo: boolean;
  bloqueadoHasta: string | null;
  creadoEn: string;
}

/**
 * Perfil en el panel familiar (RF-071, RN-17): los que la cuenta creó (RESPONSABLE) y los que
 * acompaña por invitación de su docente (VINCULADO, RF-019), que solo puede consultar.
 */
export interface PerfilFamiliaVista extends PerfilEstudianteVista {
  relacion: 'RESPONSABLE' | 'VINCULADO';
}

export interface UsuarioActualVista {
  id: string;
  rol: string;
  mfa: boolean;
  /** Adultos */
  nombre?: string;
  email?: string;
  mfaHabilitado?: boolean;
  /** Estudiantes */
  alias?: string;
  avatar?: string;
  rangoEdad?: RangoEdad;
}
