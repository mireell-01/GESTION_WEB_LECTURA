import { esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { AlmacenExportaciones } from '../../application/ports/exportaciones';
import { Exportacion, FormatoExportacion } from '../../domain/entities/exportacion';

/** Adaptador: guarda los archivos exportados en PostgreSQL (sirve igual con varias instancias). */
export class PrismaAlmacenExportaciones implements AlmacenExportaciones {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(exportacion: Exportacion, archivos: Record<FormatoExportacion, Buffer>): Promise<void> {
    await this.prisma.exportacion.create({
      data: { ...exportacion.propsSnapshot, archivoJson: archivos.json, archivoPdf: archivos.pdf },
    });
  }

  async buscar(id: string): Promise<Exportacion | null> {
    if (!esUuid(id)) return null;
    const fila = await this.prisma.exportacion.findUnique({
      where: { id },
      select: { id: true, perfilId: true, solicitadaPor: true, creadaEn: true, expiraEn: true },
    });
    return fila ? Exportacion.desdePersistencia(fila) : null;
  }

  async archivo(id: string, formato: FormatoExportacion): Promise<Buffer | null> {
    if (!esUuid(id)) return null;
    if (formato === 'json') {
      const fila = await this.prisma.exportacion.findUnique({ where: { id }, select: { archivoJson: true } });
      return fila ? Buffer.from(fila.archivoJson) : null;
    }
    const fila = await this.prisma.exportacion.findUnique({ where: { id }, select: { archivoPdf: true } });
    return fila ? Buffer.from(fila.archivoPdf) : null;
  }

  async eliminarVencidas(ahora: Date): Promise<number> {
    return (await this.prisma.exportacion.deleteMany({ where: { expiraEn: { lt: ahora } } })).count;
  }
}
