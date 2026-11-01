import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../shared-kernel/public-api';
import { ParametrosRepository, VersionParametros } from '../../application/ports/parametros.repository';

/** Adaptador: versiones de `gamificacion.parametro_gamificacion` (cada una es una fila nueva; nunca se edita). */
export class PrismaParametrosRepository implements ParametrosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async versiones(): Promise<VersionParametros[]> {
    const filas = await this.prisma.parametroGamificacion.findMany({ orderBy: { version: 'desc' } });
    return filas.map((f) => ({ version: f.version, vigenteDesde: f.vigenteDesde, creadoPor: f.creadoPor, creadoEn: f.creadoEn, parametros: f.parametros }));
  }

  /** La versión es única: si dos se publican a la vez, la segunda toma el número siguiente. */
  async publicar(p: { parametros: Record<string, unknown>; creadoPor: string; ahora: Date }): Promise<number> {
    for (let intento = 0; ; intento++) {
      const { _max } = await this.prisma.parametroGamificacion.aggregate({ _max: { version: true } });
      const version = (_max.version ?? 0) + 1;
      try {
        await this.prisma.parametroGamificacion.create({
          data: { version, parametros: p.parametros as Prisma.InputJsonValue, vigenteDesde: p.ahora, creadoPor: p.creadoPor, creadoEn: p.ahora },
        });
        return version;
      } catch (error) {
        if (intento < 3 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
  }
}
