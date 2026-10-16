import { PrismaService } from '../../../shared-kernel/public-api';
import { DispositivoRepository } from '../../application/ports/dispositivo.repository';
import { DispositivoIngreso } from '../../domain/entities/dispositivo-ingreso';

/** Adaptador: PrismaDispositivoRepository. */
export class PrismaDispositivoRepository implements DispositivoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(d: DispositivoIngreso): Promise<void> {
    const p = d.propsSnapshot;
    await this.prisma.dispositivoIngreso.upsert({
      where: { id: p.id },
      update: { revocadoEn: p.revocadoEn },
      create: { ...p },
    });
  }

  async buscarPorHashToken(hashToken: string): Promise<DispositivoIngreso | null> {
    const fila = await this.prisma.dispositivoIngreso.findUnique({ where: { hashToken } });
    return fila ? DispositivoIngreso.desdePersistencia(fila) : null;
  }
}
