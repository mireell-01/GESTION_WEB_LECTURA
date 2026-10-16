import { DispositivoIngreso } from '../../domain/entities/dispositivo-ingreso';

/** Puerto de salida: dispositivos de ingreso activados por familias o docentes (RN-04). */
export interface DispositivoRepository {
  guardar(dispositivo: DispositivoIngreso): Promise<void>;
  buscarPorHashToken(hashToken: string): Promise<DispositivoIngreso | null>;
}
