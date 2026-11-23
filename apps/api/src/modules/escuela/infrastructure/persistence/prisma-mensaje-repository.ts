import { PrismaService } from '../../../shared-kernel/public-api';
import { EnvioResumen, MensajeRepository } from '../../application/ports/mensaje.repository';
import { esSticker, MensajeDocente } from '../../domain/entities/mensaje-docente';

/** Filas que se leen para armar los últimos envíos (45 niños × 20 envíos caben de sobra). */
const FILAS_ENVIOS = 1_500;

type Fila = {
  id: string;
  envioId: string;
  aulaId: string;
  docenteId: string;
  estudianteId: string;
  paraTodaElAula: boolean;
  sticker: string;
  texto: string;
  creadoEn: Date;
  leidoEn: Date | null;
};

function aEntidad(f: Fila): MensajeDocente | null {
  return esSticker(f.sticker) ? MensajeDocente.desdePersistencia({ ...f, sticker: f.sticker }) : null;
}

/** Adaptador de persistencia de los mensajitos de la docente (schema `escuela`). */
export class PrismaMensajeRepository implements MensajeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(mensajes: MensajeDocente[]): Promise<void> {
    await this.prisma.mensajeDocente.createMany({ data: mensajes.map((m) => ({ ...m.datos })) });
  }

  async contarEnvios(aulaId: string, desde: Date, hasta: Date): Promise<number> {
    const envios = await this.prisma.mensajeDocente.groupBy({ by: ['envioId'], where: { aulaId, creadoEn: { gte: desde, lt: hasta } } });
    return envios.length;
  }

  async envios(aulaId: string, limite: number): Promise<EnvioResumen[]> {
    const filas = await this.prisma.mensajeDocente.findMany({ where: { aulaId }, orderBy: [{ creadoEn: 'desc' }, { id: 'asc' }], take: FILAS_ENVIOS });
    const porEnvio = new Map<string, EnvioResumen>();
    for (const f of filas) {
      if (!esSticker(f.sticker)) continue;
      const envio = porEnvio.get(f.envioId);
      if (envio) {
        envio.estudianteIds.push(f.estudianteId);
        if (f.leidoEn) envio.leidos += 1;
      } else if (porEnvio.size < limite) {
        porEnvio.set(f.envioId, {
          envioId: f.envioId,
          sticker: f.sticker,
          texto: f.texto,
          creadoEn: f.creadoEn,
          paraTodaElAula: f.paraTodaElAula,
          estudianteIds: [f.estudianteId],
          leidos: f.leidoEn ? 1 : 0,
        });
      }
    }
    return [...porEnvio.values()];
  }

  async noLeidos(estudianteId: string, aulaIds: string[], limite: number): Promise<MensajeDocente[]> {
    const filas = await this.prisma.mensajeDocente.findMany({
      where: { estudianteId, aulaId: { in: aulaIds }, leidoEn: null },
      orderBy: { creadoEn: 'desc' },
      take: limite,
    });
    return filas.flatMap((f) => aEntidad(f) ?? []);
  }

  async marcarLeido(mensajeId: string, estudianteId: string, ahora: Date): Promise<boolean> {
    // Un id que no es UUID no existe (y no debe llegar a la base como error).
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mensajeId)) return false;
    const existe = await this.prisma.mensajeDocente.findFirst({ where: { id: mensajeId, estudianteId }, select: { id: true } });
    if (!existe) return false;
    await this.prisma.mensajeDocente.updateMany({ where: { id: mensajeId, estudianteId, leidoEn: null }, data: { leidoEn: ahora } });
    return true;
  }

  async deEstudiante(estudianteId: string): Promise<MensajeDocente[]> {
    const filas = await this.prisma.mensajeDocente.findMany({ where: { estudianteId }, orderBy: { creadoEn: 'asc' } });
    return filas.flatMap((f) => aEntidad(f) ?? []);
  }

  async eliminarDeEstudiante(estudianteId: string): Promise<void> {
    await this.prisma.mensajeDocente.deleteMany({ where: { estudianteId } });
  }
}
