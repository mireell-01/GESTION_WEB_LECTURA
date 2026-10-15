import { PrismaService } from '../../../shared-kernel/public-api';
import { DispositivoRepository } from '../../application/ports/dispositivo.repository';
import { DispositivoFamiliar } from '../../domain/entities/dispositivo-familiar';

/** Adaptador: PrismaDispositivoRepository. */
export class PrismaDispositivoRepository implements DispositivoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(d: DispositivoFamiliar): Promise<void> {
    const p = d.propsSnapshot;
    await this.prisma.dispositivoFamiliar.upsert({
      where: { id: p.id },
      update: { revocadoEn: p.revocadoEn },
      create: { ...p },
    });
  }

  async buscarPorHashToken(hashToken: string): Promise<DispositivoFamiliar | null> {
    const fila = await this.prisma.dispositivoFamiliar.findUnique({ where: { hashToken } });
    return fila ? DispositivoFamiliar.desdePersistencia(fila) : null;
  }
}
