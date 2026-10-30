import { Prisma } from '@prisma/client';

import { esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { ActivacionRepository, ConversacionRepository, RolActivador } from '../../application/ports/asistente.ports';
import { Conversacion, Emisor, TurnoAsistente } from '../../domain/entities/conversacion';

/** Persistencia de las conversaciones en el schema `asistente` (una por sesión, retención de 30 días). */
export class PrismaConversacionRepository implements ConversacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async deSesion(sesionLecturaId: string): Promise<Conversacion | null> {
    if (!esUuid(sesionLecturaId)) return null;
    const fila = await this.prisma.conversacion.findUnique({ where: { sesionLecturaId }, include: { turnos: true } });
    if (!fila) return null;
    return Conversacion.reconstruir({
      id: fila.id,
      estudianteId: fila.estudianteId,
      sesionLecturaId: fila.sesionLecturaId,
      intercambios: fila.intercambios,
      iniciadaEn: fila.iniciadaEn,
      cerradaEn: fila.cerradaEn,
      expiraEn: fila.expiraEn,
      turnos: fila.turnos.map((t) => ({ orden: t.orden, emisor: t.emisor as Emisor, texto: t.texto, filtrado: t.filtrado, creadoEn: t.creadoEn })),
    });
  }

  async crear(c: Conversacion): Promise<boolean> {
    const s = c.snapshot;
    try {
      await this.prisma.conversacion.create({
        data: { id: s.id, estudianteId: s.estudianteId, sesionLecturaId: s.sesionLecturaId, intercambios: 0, iniciadaEn: s.iniciadaEn, expiraEn: s.expiraEn },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }

  /** Actualización condicional: solo avanza si nadie registró otro intercambio antes (RF-074). */
  async registrarIntercambio(c: Conversacion, previos: number, turnos: TurnoAsistente[]): Promise<boolean> {
    const s = c.snapshot;
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.conversacion.updateMany({
        where: { id: s.id, intercambios: previos },
        data: { intercambios: s.intercambios, cerradaEn: s.cerradaEn },
      });
      if (count === 0) return false;
      await tx.turno.createMany({ data: turnos.map((t) => ({ conversacionId: s.id, orden: t.orden, emisor: t.emisor, texto: t.texto, filtrado: t.filtrado, creadoEn: t.creadoEn })) });
      return true;
    });
  }

  async borrarVencidas(ahora: Date): Promise<number> {
    return (await this.prisma.conversacion.deleteMany({ where: { expiraEn: { lt: ahora } } })).count;
  }
}

/** RF-072: la activación del asistente por estudiante (sin fila: desactivado). */
export class PrismaActivacionRepository implements ActivacionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async activo(estudianteId: string): Promise<boolean> {
    if (!esUuid(estudianteId)) return false;
    return (await this.prisma.activacionAsistente.findUnique({ where: { estudianteId } }))?.activo ?? false;
  }

  async estados(estudianteIds: string[]): Promise<Map<string, boolean>> {
    const ids = estudianteIds.filter(esUuid);
    if (ids.length === 0) return new Map();
    const filas = await this.prisma.activacionAsistente.findMany({ where: { estudianteId: { in: ids } } });
    return new Map(filas.map((f) => [f.estudianteId, f.activo]));
  }

  async guardar(p: { estudianteIds: string[]; activo: boolean; cambiadoPor: string; rol: RolActivador; ahora: Date }): Promise<void> {
    await this.prisma.$transaction(
      p.estudianteIds.map((estudianteId) =>
        this.prisma.activacionAsistente.upsert({
          where: { estudianteId },
          create: { estudianteId, activo: p.activo, cambiadoPor: p.cambiadoPor, rol: p.rol, cambiadoEn: p.ahora },
          update: { activo: p.activo, cambiadoPor: p.cambiadoPor, rol: p.rol, cambiadoEn: p.ahora },
        }),
      ),
    );
  }
}
