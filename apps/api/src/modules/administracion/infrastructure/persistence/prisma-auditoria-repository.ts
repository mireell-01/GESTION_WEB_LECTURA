import { Prisma } from '@prisma/client';

import { PrismaService } from '../../../shared-kernel/public-api';
import { AuditoriaRepository } from '../../application/ports/auditoria.repository';
import { Auditoria, AuditoriaProps } from '../../domain/entities/auditoria';
import { FiltroAuditoria } from '../../domain/services/consulta-auditoria';

/** Adaptador: `admin.auditoria` (la base rechaza modificar y solo deja borrar lo que superó los 2 años). */
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

  async consultar(f: FiltroAuditoria, limite: number): Promise<AuditoriaProps[]> {
    const condiciones: Prisma.AuditoriaWhereInput[] = [];
    if (f.desde) condiciones.push({ ocurridoEn: { gte: f.desde } });
    if (f.hasta) condiciones.push({ ocurridoEn: { lte: f.hasta } });
    if (f.accion) condiciones.push({ accion: f.accion });
    if (f.actorId) condiciones.push({ actorId: f.actorId });
    if (f.recursoTipo) condiciones.push({ recursoTipo: f.recursoTipo });
    if (f.recursoId) condiciones.push({ recursoId: f.recursoId });
    if (f.antesDe) {
      condiciones.push({ OR: [{ ocurridoEn: { lt: f.antesDe.ocurridoEn } }, { ocurridoEn: f.antesDe.ocurridoEn, id: { lt: f.antesDe.id } }] });
    }
    const filas = await this.prisma.auditoria.findMany({
      where: { AND: condiciones },
      orderBy: [{ ocurridoEn: 'desc' }, { id: 'desc' }],
      take: limite,
    });
    return filas.map((r) => ({
      id: r.id,
      actorId: r.actorId,
      actorRol: r.actorRol,
      accion: r.accion,
      recursoTipo: r.recursoTipo,
      recursoId: r.recursoId,
      ip: r.ip,
      datos: typeof r.datos === 'object' && r.datos !== null && !Array.isArray(r.datos) ? (r.datos as Record<string, unknown>) : {},
      ocurridoEn: r.ocurridoEn,
    }));
  }

  async borrarAnterioresA(limite: Date): Promise<number> {
    return (await this.prisma.auditoria.deleteMany({ where: { ocurridoEn: { lt: limite } } })).count;
  }
}
