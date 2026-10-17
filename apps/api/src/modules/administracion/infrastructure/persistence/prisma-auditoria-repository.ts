import { PrismaService } from '../../../shared-kernel/public-api';
import { AuditoriaRepository } from '../../application/ports/auditoria.repository';
import { Auditoria } from '../../domain/entities/auditoria';

/** Adaptador: `admin.auditoria` (append-only: la base rechaza modificar o borrar). */
export class PrismaAuditoriaRepository implements AuditoriaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async agregar(registro: Auditoria): Promise<void> {
    const p = registro.propsSnapshot;
    await this.prisma.auditoria.create({
      data: {
        id: p.id,
        actorId: p.actorId,
        actorRol: p.actorRol,
        accion: p.accion,
        recursoTipo: p.recursoTipo,
        recursoId: p.recursoId,
        ip: p.ip,
        datos: JSON.parse(JSON.stringify(p.datos)),
        ocurridoEn: p.ocurridoEn,
      },
    });
  }
}
