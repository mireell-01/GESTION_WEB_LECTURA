import { Exportacion, FormatoExportacion } from '../../domain/entities/exportacion';

/** Contenido que se exporta (RF-012): datos personales, consentimiento y lo que aporta cada módulo. */
export interface DatosExportacion {
  generadoEn: string;
  aviso: string;
  perfil: Record<string, unknown>;
  consentimiento: Record<string, unknown> | null;
  [seccion: string]: unknown;
}

/** Puerto de salida: guarda la exportación y sus archivos hasta que vence. */
export interface AlmacenExportaciones {
  guardar(exportacion: Exportacion, archivos: Record<FormatoExportacion, Buffer>): Promise<void>;
  buscar(id: string): Promise<Exportacion | null>;
  archivo(id: string, formato: FormatoExportacion): Promise<Buffer | null>;
  eliminarVencidas(ahora: Date): Promise<number>;
}

/** Puerto de salida: genera el PDF legible para la familia. */
export interface GeneradorPdfExportacion {
  generar(datos: DatosExportacion): Promise<Buffer>;
}

/** Puerto de salida: firma y verifica enlaces de descarga (HMAC). */
export interface FirmadorEnlaces {
  firmar(texto: string): string;
  verificar(texto: string, firma: string): boolean;
}
