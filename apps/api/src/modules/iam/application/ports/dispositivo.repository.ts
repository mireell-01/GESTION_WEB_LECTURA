import { DispositivoFamiliar } from '../../domain/entities/dispositivo-familiar';

/** Puerto de salida: dispositivos familiares vinculados (RN-04). */
export interface DispositivoRepository {
  guardar(dispositivo: DispositivoFamiliar): Promise<void>;
  buscarPorHashToken(hashToken: string): Promise<DispositivoFamiliar | null>;
}
