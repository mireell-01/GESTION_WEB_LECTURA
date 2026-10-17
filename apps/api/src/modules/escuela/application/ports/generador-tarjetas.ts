import { TarjetaAcceso } from '../dto/escuela.dto';

/** Puerto de salida: hoja imprimible de tarjetas de acceso (RF-017: A4, 8 tarjetas por hoja). */
export interface GeneradorTarjetasPdf {
  generar(datos: { nombreAula: string; tarjetas: TarjetaAcceso[] }): Promise<Buffer>;
}
