/** Puerto de salida: almacén de archivos (disco local en desarrollo; S3 en la nube, ADR-008). */
export interface AlmacenArchivos {
  guardar(clave: string, datos: Uint8Array, tipoMime: string): Promise<void>;
  leer(clave: string): Promise<Buffer | null>;
}

/**
 * Puerto: firma de subidas — como una URL prefirmada de S3: lo declarado (tipo, formato, tamaño,
 * texto alternativo) viaja firmado y vence en minutos; nada se guarda hasta que llega el archivo.
 */
export interface FirmadorSubidas {
  firmar(datos: Record<string, unknown>, expiraEn: Date): string;
  /** Datos firmados, o null si la firma no corresponde o ya venció. */
  verificar(token: string, ahora: Date): Record<string, unknown> | null;
}
