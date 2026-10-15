import { PerfilEstudiante } from '../../domain/entities/perfil-estudiante';

/** Puerto de salida: persistencia de perfiles de estudiante. */
export interface PerfilEstudianteRepository {
  guardar(perfil: PerfilEstudiante): Promise<void>;
  buscarPorId(id: string): Promise<PerfilEstudiante | null>;
  buscarPorIds(ids: string[]): Promise<PerfilEstudiante[]>;
  /** Perfiles no eliminados de un responsable (activos e inactivos). */
  listarPorResponsable(cuentaResponsableId: string): Promise<PerfilEstudiante[]>;
}
