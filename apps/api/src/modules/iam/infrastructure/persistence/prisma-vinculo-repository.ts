import { esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { OrigenVinculo, VinculoFamiliar, VinculoRepository } from '../../application/ports/vinculo.repository';

/** Adaptador: vínculos de familiares adicionales en `iam.vinculo_responsable`. */
export class PrismaVinculoRepository implements VinculoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async agregar(v: VinculoFamiliar & { id: string }): Promise<void> {
    await this.prisma.vinculoResponsable.upsert({
      where: { perfilId_cuentaId: { perfilId: v.perfilId, cuentaId: v.cuentaId } },
      update: { origen: v.origen, vinculadoEn: v.vinculadoEn, revocadoEn: null },
      create: { id: v.id, perfilId: v.perfilId, cuentaId: v.cuentaId, origen: v.origen, vinculadoEn: v.vinculadoEn },
    });
  }

  async vigentesDePerfil(perfilId: string): Promise<VinculoFamiliar[]> {
    if (!esUuid(perfilId)) return [];
    const filas = await this.prisma.vinculoResponsable.findMany({
      where: { perfilId, revocadoEn: null },
      orderBy: { vinculadoEn: 'asc' },
    });
    return filas.map((f) => ({ perfilId: f.perfilId, cuentaId: f.cuentaId, origen: f.origen as OrigenVinculo, vinculadoEn: f.vinculadoEn }));
  }

  async perfilesVinculadosA(cuentaId: string): Promise<string[]> {
    if (!esUuid(cuentaId)) return [];
    const filas = await this.prisma.vinculoResponsable.findMany({
      where: { cuentaId, revocadoEn: null },
      select: { perfilId: true },
      orderBy: { vinculadoEn: 'asc' },
    });
    return filas.map((f) => f.perfilId);
  }

  async contarVigentesPorPerfiles(perfilIds: string[]): Promise<Record<string, number>> {
    const ids = perfilIds.filter(esUuid);
    if (ids.length === 0) return {};
    const grupos = await this.prisma.vinculoResponsable.groupBy({
      by: ['perfilId'],
      where: { perfilId: { in: ids }, revocadoEn: null },
      _count: { _all: true },
    });
    return Object.fromEntries(grupos.map((g) => [g.perfilId, g._count._all]));
  }
}
