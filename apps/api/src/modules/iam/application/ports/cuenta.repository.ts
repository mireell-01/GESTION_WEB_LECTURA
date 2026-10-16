import { Cuenta } from '../../domain/entities/cuenta';

/** Puerto de salida: persistencia del agregado CuentaAdulta. */
export interface CuentaRepository {
  guardar(cuenta: Cuenta): Promise<void>;
  buscarPorId(id: string): Promise<Cuenta | null>;
  buscarPorEmail(email: string): Promise<Cuenta | null>;
  existeEmail(email: string): Promise<boolean>;
  listar(filtro: { rol?: string; texto?: string }): Promise<Cuenta[]>;
}
