import { esUuid, Habilidad, PrismaService } from '../../../shared-kernel/public-api';
import { PerfilRepository, RecomendacionRepository } from '../../application/ports/progreso.ports';
import { OrigenCambio, PerfilLector } from '../../domain/entities/perfil-lector';
import { MaestriaDesactualizadaError } from '../../domain/errors/errores-progreso';
import { Recomendacion, TipoRecomendacion } from '../../domain/services/recomendador';

const esChoqueUnico = (error: unknown) => (error as { code?: string })?.code === 'P2002';

/** Adaptador de persistencia del perfil lector sobre el schema `progreso` (SRS §7). */
export class PrismaPerfilRepository implements PerfilRepository {
  constructor(private readonly prisma: PrismaService) {}

  async buscar(estudianteId: string): Promise<PerfilLector | null> {
    if (!esUuid(estudianteId)) return null;
    const filas = await this.prisma.maestriaHabilidad.findMany({ where: { estudianteId } });
    if (filas.length === 0) return null;
    return PerfilLector.desdePersistencia(
      estudianteId,
      filas.map((f) => ({
        habilidad: f.habilidad as Habilidad,
        valor: Number(f.valor),
        itemsContados: f.itemsContados,
        actualizadoEn: f.actualizadoEn,
        version: f.version,
      })),
    );
  }

  /** Las 5 maestrías (o sus cambios, con bloqueo optimista por versión) y el historial, en una transacción. */
  async guardar(perfil: PerfilLector): Promise<void> {
    const cambiadas = new Set(perfil.habilidadesCambiadas());
    const ahora = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        if (!perfil.estaPersistido) {
          await tx.maestriaHabilidad.createMany({
            data: perfil.todas().map((m) => ({
              estudianteId: perfil.estudianteId,
              habilidad: m.habilidad,
              valor: m.valor,
              itemsContados: m.itemsContados,
              actualizadoEn: m.actualizadoEn ?? ahora,
              version: m.version + (cambiadas.has(m.habilidad) ? 1 : 0),
            })),
          });
        } else {
          for (const h of cambiadas) {
            const m = perfil.de(h);
            const { count } = await tx.maestriaHabilidad.updateMany({
              where: { estudianteId: perfil.estudianteId, habilidad: h, version: m.version },
              data: {
                valor: m.valor,
                itemsContados: m.itemsContados,
                actualizadoEn: m.actualizadoEn ?? ahora,
                version: m.version + 1,
              },
            });
            if (count === 0) throw new MaestriaDesactualizadaError();
          }
        }
        await tx.historialMaestria.createMany({
          data: perfil.cambios().map((c) => ({
            estudianteId: perfil.estudianteId,
            habilidad: c.habilidad,
            valorAnterior: c.anterior,
            valorNuevo: c.nuevo,
            origen: c.origen,
            origenId: c.origenId,
            registradoEn: c.registradoEn,
          })),
        });
      });
    } catch (error) {
      // Otro pedido creó el perfil o aplicó el mismo origen antes: se recalcula (y ahí se ve que ya estaba).
      if (esChoqueUnico(error)) throw new MaestriaDesactualizadaError();
      throw error;
    }
    perfil.confirmarCambios();
  }

  async yaAplicado(origen: OrigenCambio, origenId: string): Promise<boolean> {
    if (!esUuid(origenId)) return false;
    return (await this.prisma.historialMaestria.count({ where: { origen, origenId } })) > 0;
  }
}

/** Adaptador de persistencia de las recomendaciones vigentes (RF-055). */
export class PrismaRecomendacionRepository implements RecomendacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async vigentes(estudianteId: string) {
    const filas = await this.prisma.recomendacion.findMany({
      where: { estudianteId, vigente: true },
      orderBy: { prioridad: 'asc' },
    });
    return filas.map((f) => ({
      tipo: f.tipo as TipoRecomendacion,
      lecturaId: f.lecturaId,
      asignacionId: f.asignacionId,
      habilidad: f.habilidad as Habilidad | null,
    }));
  }

  async reemplazar(
    estudianteId: string,
    recomendaciones: Recomendacion[],
    ahora: Date,
  ): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.recomendacion.updateMany({
          where: { estudianteId, vigente: true },
          data: { vigente: false },
        }),
        this.prisma.recomendacion.createMany({
          data: recomendaciones.map((r, i) => ({
            estudianteId,
            tipo: r.tipo,
            lecturaId: r.lecturaId,
            asignacionId: r.asignacionId,
            habilidad: r.habilidad,
            prioridad: i + 1,
            motivo: r.motivo.slice(0, 300),
            vigente: true,
            generadaEn: ahora,
          })),
        }),
      ]);
    } catch (error) {
      // Dos pedidos a la vez: ya quedó guardado el cálculo del otro, que es el mismo.
      if (esChoqueUnico(error)) return;
      throw error;
    }
  }
}
