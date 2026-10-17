import { Asignacion } from '../../domain/entities/asignacion';

/** Puerto de salida: persistencia del agregado Asignacion (con sus destinatarios). */
export interface AsignacionRepository {
  guardar(asignacion: Asignacion): Promise<void>;
  buscarPorId(id: string): Promise<Asignacion | null>;
  listarPorAulas(aulaIds: string[]): Promise<Asignacion[]>;
}
