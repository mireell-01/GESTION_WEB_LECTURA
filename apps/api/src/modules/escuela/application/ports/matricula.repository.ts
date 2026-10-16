import { Matricula } from '../../domain/entities/matricula';

/** Puerto de salida: persistencia de matrículas. */
export interface MatriculaRepository {
  guardar(matricula: Matricula): Promise<void>;
  buscar(aulaId: string, estudianteId: string): Promise<Matricula | null>;
  listarActivasPorAula(aulaId: string): Promise<Matricula[]>;
  listarPorEstudiante(estudianteId: string): Promise<Matricula[]>;
  contarActivasPorAulas(aulaIds: string[]): Promise<Record<string, number>>;
}
