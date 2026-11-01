import { PrismaService } from '../../../shared-kernel/public-api';
import { AulasDeDocente, ResumenAulasRepository } from '../../application/ports/resumen-aulas';

/** Adaptador: aulas activas y matrículas activas de varios docentes, en una sola consulta. */
export class PrismaResumenAulas implements ResumenAulasRepository {
  constructor(private readonly prisma: PrismaService) {}

  async porDocentes(docenteIds: string[]): Promise<Map<string, AulasDeDocente>> {
    const resumen = new Map<string, AulasDeDocente>(docenteIds.map((id) => [id, { aulas: 0, estudiantes: 0 }]));
    if (docenteIds.length === 0) return resumen;
    const aulas = await this.prisma.aula.findMany({
      where: { docenteId: { in: docenteIds }, estado: 'ACTIVA' },
      select: { docenteId: true, _count: { select: { matriculas: { where: { estado: 'ACTIVA' } } } } },
    });
    for (const a of aulas) {
      const r = resumen.get(a.docenteId) as AulasDeDocente;
      r.aulas += 1;
      r.estudiantes += a._count.matriculas;
    }
    return resumen;
  }
}
