import type { Asignacion as AsignacionFila } from '@prisma/client';

import { esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { AsignacionRepository } from '../../application/ports/asignacion.repository';
import { Asignacion, EstadoAsignacion, TipoAsignacion } from '../../domain/entities/asignacion';

/**
 * Adaptador: PrismaAsignacionRepository. La asignación y sus destinatarios se guardan juntos
 * (`escuela.asignacion` + `escuela.asignacion_destinatario`) en una transacción.
 */
export class PrismaAsignacionRepository implements AsignacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(asignacion: Asignacion): Promise<void> {
    const p = asignacion.propsSnapshot;
    const datos = {
      aulaId: p.aulaId,
      docenteId: p.docenteId,
      tipo: p.tipo,
      lecturaId: p.tipo === 'LECTURA' ? p.contenidoId : null,
      misionId: p.tipo === 'MISION' ? p.contenidoId : null,
      titulo: p.titulo,
      paraTodaElAula: p.estudianteIds.length === 0,
      fechaInicio: p.fechaInicio,
      fechaLimite: p.fechaLimite,
      estado: p.estado,
    };
    await this.prisma.$transaction([
      this.prisma.asignacion.upsert({
        where: { id: p.id },
        update: datos,
        create: { id: p.id, creadaEn: p.creadaEn, ...datos },
      }),
      this.prisma.asignacionDestinatario.deleteMany({ where: { asignacionId: p.id } }),
      this.prisma.asignacionDestinatario.createMany({
        data: p.estudianteIds.map((estudianteId) => ({ asignacionId: p.id, estudianteId })),
      }),
    ]);
  }

  async buscarPorId(id: string): Promise<Asignacion | null> {
    if (!esUuid(id)) return null;
    const fila = await this.prisma.asignacion.findUnique({ where: { id }, include: { destinatarios: true } });
    return fila ? this.aDominio(fila) : null;
  }

  async listarPorAulas(aulaIds: string[]): Promise<Asignacion[]> {
    const ids = aulaIds.filter(esUuid);
    if (ids.length === 0) return [];
    const filas = await this.prisma.asignacion.findMany({
      where: { aulaId: { in: ids } },
      include: { destinatarios: true },
      orderBy: { fechaLimite: 'asc' },
    });
    return filas.map((f) => this.aDominio(f));
  }

  private aDominio(f: AsignacionFila & { destinatarios: { estudianteId: string }[] }): Asignacion {
    return Asignacion.desdePersistencia({
      id: f.id,
      aulaId: f.aulaId,
      docenteId: f.docenteId,
      tipo: f.tipo as TipoAsignacion,
      contenidoId: (f.lecturaId ?? f.misionId) as string,
      titulo: f.titulo,
      estudianteIds: f.paraTodaElAula ? [] : f.destinatarios.map((d) => d.estudianteId),
      fechaInicio: f.fechaInicio,
      fechaLimite: f.fechaLimite,
      estado: f.estado as EstadoAsignacion,
      creadaEn: f.creadaEn,
    });
  }
}
