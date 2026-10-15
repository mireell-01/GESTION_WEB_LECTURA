import { Sesion } from '../../domain/entities/sesion';

/** Puerto de salida: sesiones y refresh tokens (RF-003, RF-010). */
export interface SesionRepository {
  guardar(sesion: Sesion): Promise<void>;
  buscarPorId(id: string): Promise<Sesion | null>;
  buscarPorHashRefreshToken(hash: string): Promise<Sesion | null>;
  /** Revoca todas las sesiones vivas de una cuenta o perfil (cambio de contraseña, suspensión). */
  revocarTodasDe(sujetoId: string, ahora: Date): Promise<void>;
}
