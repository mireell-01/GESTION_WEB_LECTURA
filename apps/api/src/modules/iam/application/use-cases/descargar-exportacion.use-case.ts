import { FORMATOS_EXPORTACION, FormatoExportacion } from '../../domain/entities/exportacion';
import { EnlaceDescargaInvalidoError } from '../../domain/errors/errores-iam';
import { Reloj } from '../dto/iam.dto';
import { AlmacenExportaciones, FirmadorEnlaces } from '../ports/exportaciones';
import { textoFirmado } from './solicitar-exportacion.use-case';

const TIPO_MIME: Record<FormatoExportacion, string> = {
  json: 'application/json; charset=utf-8',
  pdf: 'application/pdf',
};

/**
 * Use Case: DescargarExportacion (RF-012). El enlace firmado es la única credencial: se verifica
 * la firma (id, formato y vencimiento) y que no hayan pasado las 72 h.
 */
export class DescargarExportacionUseCase {
  constructor(
    private readonly almacen: AlmacenExportaciones,
    private readonly firmador: FirmadorEnlaces,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { id: string; formato: string; expira: string; firma: string }): Promise<{
    contenido: Buffer;
    tipoMime: string;
    nombreArchivo: string;
  }> {
    const formato = entrada.formato as FormatoExportacion;
    const expira = Number(entrada.expira);
    if (
      !FORMATOS_EXPORTACION.includes(formato) ||
      !Number.isInteger(expira) ||
      !this.firmador.verificar(textoFirmado(entrada.id, formato, expira), entrada.firma)
    ) {
      throw new EnlaceDescargaInvalidoError(false);
    }

    const ahora = this.ahora();
    const exportacion = await this.almacen.buscar(entrada.id);
    if (ahora.getTime() > expira || !exportacion || !exportacion.estaVigente(ahora)) {
      throw new EnlaceDescargaInvalidoError(true);
    }
    const contenido = await this.almacen.archivo(entrada.id, formato);
    if (!contenido) {
      throw new EnlaceDescargaInvalidoError(true);
    }
    const fecha = exportacion.propsSnapshot.creadaEn.toISOString().slice(0, 10);
    return { contenido, tipoMime: TIPO_MIME[formato], nombreArchivo: `lectoaventura-datos-${fecha}.${formato}` };
  }
}
