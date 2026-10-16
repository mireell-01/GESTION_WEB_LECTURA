import { TipoVerificacion, VerificacionCorreo } from '../../domain/entities/verificacion-correo';

/** Puerto de salida: enlaces de un solo uso (RF-002, RF-004). */
export interface VerificacionRepository {
  guardar(verificacion: VerificacionCorreo): Promise<void>;
  buscarPorCodigo(codigo: string, tipo: TipoVerificacion): Promise<VerificacionCorreo | null>;
}
