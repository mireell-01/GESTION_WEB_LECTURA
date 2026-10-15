import type { Matricula as MatriculaFila } from '@prisma/client';

import { PrismaService } from '../../../shared-kernel/public-api';
import { MatriculaRepository } from '../../application/ports/matricula.repository';
import { EstadoMatricula, Matricula } from '../../domain/entities/matricula';

/** Adaptador: PrismaMatriculaRepository. */
export class PrismaMatriculaRepository implements MatriculaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardar(m: Matricula): Promise<void> {
    const p = m.propsSnapshot;
    await this.prisma.matricula.upsert({
      where: { aulaId_estudianteId: { aulaId: p.aulaId, estudianteId: p.estudianteId } },
      update: { estado: p.estado, retiradaEn: p.retiradaEn },
      create: { ...p },
    });
  }

  async buscar(aulaId: string, estudianteId: string): Promise<Matricula | null> {
    const fila = await this.prisma.matricula.findUnique({ where: { aulaId_estudianteId: { aulaId, estudianteId } } });
    return fila ? this.aDominio(fila) : null;
  }

  async listarActivasPorAula(aulaId: string): Promise<Matricula[]> {
    const filas = await this.prisma.matricula.findMany({ where: { aulaId, estado: 'ACTIVA' }, orderBy: { creadaEn: 'asc' } });
    return filas.map((f) => this.aDominio(f));
  }

  async listarPorEstudiante(estudianteId: string): Promise<Matricula[]> {
    const filas = await this.prisma.matricula.findMany({ where: { estudianteId } });
    return filas.map((f) => this.aDominio(f));
  }

  async contarActivasPorAulas(aulaIds: string[]): Promise<Record<string, number>> {
    if (aulaIds.length === 0) return {};
    const grupos = await this.prisma.matricula.groupBy({
      by: ['aulaId'],
      where: { aulaId: { in: aulaIds }, estado: 'ACTIVA' },
      _count: { _all: true },
    });
    return Object.fromEntries(grupos.map((g) => [g.aulaId, g._count._all]));
  }

  private aDominio(f: MatriculaFila): Matricula {
    return Matricula.desdePersistencia({ ...f, estado: f.estado as EstadoMatricula });
  }
}
