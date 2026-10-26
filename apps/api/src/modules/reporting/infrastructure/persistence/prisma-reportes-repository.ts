import { esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { AulaActiva, DesempenoHabilidad, ReportesRepository } from '../../application/ports/reporting.ports';
import { MaestriaMedida } from '../../domain/services/mapa-calor';
import { ActividadSemanal } from '../../domain/services/resumen-semanal';

/**
 * Adaptador de lectura sobre el schema `reporting` (SAD §5): vistas materializadas refrescadas cada
 * 5 minutos y vistas simples de matrícula. Ninguna escritura en los schemas de otros módulos.
 */
export class PrismaReportesRepository implements ReportesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async refrescadoEn(): Promise<Date | null> {
    return (await this.prisma.refrescoVistas.findUnique({ where: { id: 1 } }))?.refrescadoEn ?? null;
  }

  /** Un solo refresco a la vez aunque haya varias instancias de la API (candado de PostgreSQL). */
  async refrescar(): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const [candado] = await tx.$queryRaw<{ libre: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtext('reporting.refrescar_vistas')) AS libre`;
        if (candado?.libre) await tx.$executeRaw`SELECT "reporting"."refrescar_vistas"()`;
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  }

  async estudiantesDeAula(aulaId: string): Promise<{ estudianteId: string; matriculadoEn: Date }[]> {
    if (!esUuid(aulaId)) return [];
    const filas = await this.prisma.$queryRaw<{ estudiante_id: string; matriculado_en: Date }[]>`
      SELECT estudiante_id, matriculado_en FROM "reporting"."v_estudiantes_aula" WHERE aula_id = ${aulaId}::uuid`;
    return filas.map((f) => ({ estudianteId: f.estudiante_id, matriculadoEn: f.matriculado_en }));
  }

  async maestrias(aulaId: string): Promise<(MaestriaMedida & { estudianteId: string })[]> {
    if (!esUuid(aulaId)) return [];
    const filas = await this.prisma.$queryRaw<{ estudiante_id: string; habilidad: string; valor: number; items_contados: number }[]>`
      SELECT estudiante_id, habilidad, valor::float8 AS valor, items_contados
      FROM "reporting"."mv_maestria_estudiante" WHERE aula_id = ${aulaId}::uuid`;
    return filas.map((f) => ({ estudianteId: f.estudiante_id, habilidad: f.habilidad, valor: f.valor, items: f.items_contados }));
  }

  async desempeno(aulaId: string): Promise<DesempenoHabilidad[]> {
    if (!esUuid(aulaId)) return [];
    const filas = await this.prisma.$queryRaw<
      { habilidad: string; estudiantes: number; promedio: number; aun_descubriendo: number; nivel_c: number; nivel_b: number; nivel_a: number; nivel_ad: number }[]
    >`
      SELECT habilidad, estudiantes, maestria_promedio::float8 AS promedio, aun_descubriendo, nivel_c, nivel_b, nivel_a, nivel_ad
      FROM "reporting"."mv_desempeno_aula" WHERE aula_id = ${aulaId}::uuid`;
    return filas.map((f) => ({
      habilidad: f.habilidad,
      estudiantes: f.estudiantes,
      promedio: f.promedio,
      descubriendo: f.aun_descubriendo,
      C: f.nivel_c,
      B: f.nivel_b,
      A: f.nivel_a,
      AD: f.nivel_ad,
    }));
  }

  async ultimaActividad(estudianteIds: string[]): Promise<Map<string, Date>> {
    const ids = estudianteIds.filter(esUuid);
    if (ids.length === 0) return new Map();
    const filas = await this.prisma.$queryRaw<{ estudiante_id: string; ultima_actividad_en: Date }[]>`
      SELECT estudiante_id, ultima_actividad_en FROM "reporting"."mv_actividad_estudiante" WHERE estudiante_id = ANY(${ids}::uuid[])`;
    return new Map(filas.map((f) => [f.estudiante_id, f.ultima_actividad_en]));
  }

  async actividadSemanal(estudianteIds: string[], semanas: string[]): Promise<ActividadSemanal[]> {
    const ids = estudianteIds.filter(esUuid);
    if (ids.length === 0 || semanas.length === 0) return [];
    const filas = await this.prisma.$queryRaw<{ estudiante_id: string; semana: string; lecturas_finalizadas: number; minutos: number; respuestas: number }[]>`
      SELECT estudiante_id, semana::text AS semana, lecturas_finalizadas, minutos_lectura::float8 AS minutos, respuestas
      FROM "reporting"."mv_actividad_semanal"
      WHERE estudiante_id = ANY(${ids}::uuid[]) AND semana = ANY(${semanas}::date[])`;
    return filas.map((f) => ({ estudianteId: f.estudiante_id, semana: f.semana, lecturas: f.lecturas_finalizadas, minutos: f.minutos, respuestas: f.respuestas }));
  }

  async aulasActivas(): Promise<AulaActiva[]> {
    const filas = await this.prisma.$queryRaw<{ aula_id: string; docente_id: string; nombre: string; estudiantes: number }[]>`
      SELECT aula_id, docente_id, nombre, estudiantes FROM "reporting"."v_aulas_activas" ORDER BY docente_id, nombre`;
    return filas.map((f) => ({ aulaId: f.aula_id, docenteId: f.docente_id, nombre: f.nombre, estudiantes: f.estudiantes }));
  }

  async registrarResumen(docenteId: string, semana: string, aulas: number): Promise<boolean> {
    const { count } = await this.prisma.resumenSemanalEnviado.createMany({
      data: [{ docenteId, semana: new Date(`${semana}T00:00:00Z`), aulas }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async liberarResumen(docenteId: string, semana: string): Promise<void> {
    await this.prisma.resumenSemanalEnviado.deleteMany({ where: { docenteId, semana: new Date(`${semana}T00:00:00Z`) } });
  }
}
