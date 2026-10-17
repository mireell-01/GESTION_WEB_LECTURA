import { Aula } from '../../domain/entities/aula';

/** Puerto de salida: persistencia del agregado Aula. */
export interface AulaRepository {
  guardar(aula: Aula): Promise<void>;
  buscarPorId(id: string): Promise<Aula | null>;
  existeCodigo(codigo: string): Promise<boolean>;
  listarPorDocente(docenteId: string): Promise<Aula[]>;
  buscarPorIds(ids: string[]): Promise<Aula[]>;
}
