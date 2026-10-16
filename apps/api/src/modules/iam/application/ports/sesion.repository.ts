import { Sesion } from '../../domain/entities/sesion';

/** Puerto de salida: sesiones y refresh tokens (RF-003, RF-010, ADR-005). */
export interface SesionRepository {
  guardar(sesion: Sesion): Promise<void>;
  buscarPorId(id: string): Promise<Sesion | null>;
  buscarPorHashRefreshToken(hash: string): Promise<Sesion | null>;
  /** Revoca todas las sesiones vivas de una cuenta o perfil (cambio de contraseña, suspensión). */
  revocarTodasDe(sujetoId: string, ahora: Date): Promise<void>;
  /** ADR-005: guarda la huella de un refresh token ya rotado para detectar su reutilización. */
  registrarRefreshUsado(hash: string, sesionId: string, ahora: Date): Promise<void>;
  /** Id de la sesión a la que perteneció un refresh token ya rotado, o null. */
  sesionDeRefreshUsado(hash: string): Promise<string | null>;
}
