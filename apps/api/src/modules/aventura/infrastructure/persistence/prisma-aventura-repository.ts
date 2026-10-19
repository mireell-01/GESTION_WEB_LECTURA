import { ErrorDeNegocio, esUuid, Habilidad, PrismaService, RangoEdad } from '../../../shared-kernel/public-api';
import { AventuraRepository, MundoCatalogo } from '../../application/ports/aventura.repository';
import { Mision } from '../../domain/entities/mision';
import { EstadoMundo, ProgresoAventura } from '../../domain/entities/progreso-aventura';
import { EstadoMision } from '../../domain/services/politica-progresion';

type FilaMision = {
  id: string;
  mundoId: string;
  rangoEdad: string;
  orden: number;
  titulo: string;
  descripcion: string;
  lecturas: { lecturaId: string; orden: number }[];
};

const CON_LECTURAS = { lecturas: { orderBy: { orden: 'asc' as const } } };

/** Adaptador de persistencia de Aventura sobre el schema `aventura` (SRS §7). */
export class PrismaAventuraRepository implements AventuraRepository {
  constructor(private readonly prisma: PrismaService) {}

  async mundos(): Promise<MundoCatalogo[]> {
    const filas = await this.prisma.mundo.findMany({ orderBy: { numero: 'asc' } });
    return filas.map((f) => ({ id: f.id, numero: f.numero, nombre: f.nombre, descripcion: f.descripcion, habilidadesFoco: f.habilidadesFoco as Habilidad[] }));
  }

  async progreso(estudianteId: string): Promise<ProgresoAventura | null> {
    const filas = await this.prisma.progresoMundo.findMany({ where: { estudianteId }, include: { mundo: { select: { numero: true } } } });
    if (filas.length === 0) return null;
    return ProgresoAventura.desdePersistencia(
      estudianteId,
      filas.map((f) => ({
        mundoId: f.mundoId,
        numero: f.mundo.numero,
        estado: f.estado as EstadoMundo,
        desbloqueadoEn: f.desbloqueadoEn,
        completadoEn: f.completadoEn,
        celebradoEn: f.celebradoEn,
      })),
    );
  }

  async crearProgreso(progreso: ProgresoAventura): Promise<boolean> {
    const r = await this.prisma.progresoMundo.createMany({
      data: progreso.mundos.map((m) => ({
        estudianteId: progreso.estudianteId,
        mundoId: m.mundoId,
        estado: m.estado,
        desbloqueadoEn: m.desbloqueadoEn,
        completadoEn: m.completadoEn,
        celebradoEn: m.celebradoEn,
      })),
      skipDuplicates: true,
    });
    return r.count > 0;
  }

  avanzarMundo(
    estudianteId: string,
    completado: { mundoId: string; completadoEn: Date },
    desbloqueado: { mundoId: string; desbloqueadoEn: Date } | null,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Condicional: si otro evento ya completó este mundo, no se hace nada (count = 0).
      const actual = await tx.progresoMundo.updateMany({
        where: { estudianteId, mundoId: completado.mundoId, estado: 'DISPONIBLE' },
        data: { estado: 'COMPLETADO', completadoEn: completado.completadoEn },
      });
      if (actual.count !== 1) return false;
      if (desbloqueado) {
        const siguiente = await tx.progresoMundo.updateMany({
          where: { estudianteId, mundoId: desbloqueado.mundoId, estado: 'BLOQUEADO' },
          data: { estado: 'DISPONIBLE', desbloqueadoEn: desbloqueado.desbloqueadoEn },
        });
        if (siguiente.count !== 1) throw new Error('Progreso de aventura inconsistente: el mundo siguiente no estaba bloqueado');
      }
      return true;
    });
  }

  async marcarCelebrado(estudianteId: string, mundoId: string, ahora: Date): Promise<void> {
    if (!esUuid(mundoId)) return;
    await this.prisma.progresoMundo.updateMany({
      where: { estudianteId, mundoId, celebradoEn: null, desbloqueadoEn: { not: null } },
      data: { celebradoEn: ahora },
    });
  }

  async misiones(mundoId: string, rangoEdad: RangoEdad): Promise<Mision[]> {
    if (!esUuid(mundoId)) return [];
    const filas = await this.prisma.mision.findMany({ where: { mundoId, rangoEdad }, include: CON_LECTURAS, orderBy: { orden: 'asc' } });
    return filas.map(aMision);
  }

  async mision(id: string): Promise<Mision | null> {
    if (!esUuid(id)) return null;
    const fila = await this.prisma.mision.findUnique({ where: { id }, include: CON_LECTURAS });
    return fila ? aMision(fila) : null;
  }

  async misionesConLectura(lecturaId: string, rangoEdad: RangoEdad): Promise<Mision[]> {
    if (!esUuid(lecturaId)) return [];
    const filas = await this.prisma.mision.findMany({
      where: { rangoEdad, lecturas: { some: { lecturaId } } },
      include: CON_LECTURAS,
      orderBy: [{ mundo: { numero: 'asc' } }, { orden: 'asc' }],
    });
    return filas.map(aMision);
  }

  async contarMisiones(rangoEdad: RangoEdad): Promise<Map<string, number>> {
    const grupos = await this.prisma.mision.groupBy({ by: ['mundoId'], where: { rangoEdad }, _count: { _all: true } });
    return new Map(grupos.map((g) => [g.mundoId, g._count._all]));
  }

  async guardarMision(m: Mision): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.mision.upsert({
          where: { id: m.id },
          create: { id: m.id, mundoId: m.mundoId, rangoEdad: m.rangoEdad, orden: m.orden, titulo: m.titulo, descripcion: m.descripcion },
          update: { orden: m.orden, titulo: m.titulo, descripcion: m.descripcion },
        }),
        this.prisma.misionLectura.deleteMany({ where: { misionId: m.id } }),
        this.prisma.misionLectura.createMany({ data: m.lecturaIds.map((lecturaId, i) => ({ misionId: m.id, lecturaId, orden: i + 1 })) }),
      ]);
    } catch (error) {
      throw choqueDeOrden(error);
    }
  }

  async reordenar(misiones: Mision[]): Promise<void> {
    // La restricción única del orden es diferible: los intercambios intermedios valen dentro de la transacción.
    try {
      await this.prisma.$transaction(misiones.map((m) => this.prisma.mision.update({ where: { id: m.id }, data: { orden: m.orden } })));
    } catch (error) {
      throw choqueDeOrden(error);
    }
  }

  async estadosMision(estudianteId: string, misionIds: string[]): Promise<Map<string, EstadoMision>> {
    if (misionIds.length === 0) return new Map();
    const filas = await this.prisma.progresoMision.findMany({ where: { estudianteId, misionId: { in: misionIds } } });
    return new Map(filas.map((f) => [f.misionId, f.estado as EstadoMision]));
  }

  async guardarEstadoMision(estudianteId: string, misionId: string, estado: EstadoMision, ahora: Date): Promise<void> {
    const completada = estado === 'COMPLETADA' ? { completadaEn: ahora } : {};
    await this.prisma.progresoMision.upsert({
      where: { estudianteId_misionId: { estudianteId, misionId } },
      create: { estudianteId, misionId, estado, iniciadaEn: ahora, ...completada },
      update: { estado, ...completada },
    });
  }

  async completadasPorMundo(estudianteId: string, rangoEdad: RangoEdad): Promise<Map<string, number>> {
    const filas = await this.prisma.progresoMision.findMany({
      where: { estudianteId, estado: 'COMPLETADA', mision: { rangoEdad } },
      select: { mision: { select: { mundoId: true } } },
    });
    const conteo = new Map<string, number>();
    for (const f of filas) conteo.set(f.mision.mundoId, (conteo.get(f.mision.mundoId) ?? 0) + 1);
    return conteo;
  }
}

function aMision(f: FilaMision): Mision {
  return Mision.desdePersistencia({
    id: f.id,
    mundoId: f.mundoId,
    rangoEdad: f.rangoEdad as RangoEdad,
    orden: f.orden,
    datos: { titulo: f.titulo, descripcion: f.descripcion, lecturaIds: f.lecturas.map((l) => l.lecturaId) },
  });
}

/** Dos personas agregaron u ordenaron misiones del mismo mundo a la vez: la segunda debe reintentar. */
function choqueDeOrden(error: unknown): unknown {
  const e = error as { code?: string; message?: string };
  if (e?.code === 'P2002' || e?.message?.includes('mision_mundo_id_rango_edad_orden_key')) {
    return new ErrorDeNegocio('Otra persona cambió las misiones de este mundo al mismo tiempo: vuelve a cargar e inténtalo de nuevo', 'CONFLICTO');
  }
  return error;
}
