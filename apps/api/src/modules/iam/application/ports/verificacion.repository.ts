import { TipoVerificacion, VerificacionCorreo } from '../../domain/entities/verificacion-correo';

/** Puerto de salida: enlaces de un solo uso (RF-002, RF-004). */
export interface VerificacionRepository {
  guardar(verificacion: VerificacionCorreo): Promise<void>;
  buscarPorCodigo(codigo: string, tipo: TipoVerificacion): Promise<VerificacionCorreo | null>;
  /** Enlaces de la cuenta creados desde `desde` (para el tiempo de espera entre reenvíos). */
  listarRecientes(cuentaId: string, tipo: TipoVerificacion, desde: Date): Promise<VerificacionCorreo[]>;
  /** Deja sin efecto los enlaces aún utilizables de la cuenta; devuelve cuántos. */
  reemplazarVigentes(cuentaId: string, tipo: TipoVerificacion, ahora: Date): Promise<number>;
}
