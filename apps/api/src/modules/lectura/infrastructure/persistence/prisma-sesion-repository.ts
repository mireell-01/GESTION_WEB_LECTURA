import { Prisma } from '@prisma/client';

import { ErrorDeNegocio, esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { SesionRepository } from '../../application/ports/lectura.ports';
import { EstadoRespuesta, EstadoSesion, NivelUso, RespuestaItem, SesionLectura } from '../../domain/entities/sesion-lectura';
import { Modalidad } from '../../domain/value-objects/contenido-lectura';

const COMPLETA = {
  respuestas: { include: { usosPista: true, justificacion: true, valoracion: true } },
  decisiones: { orderBy: [{ decididaEn: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.SesionLecturaInclude;

type Fila = Prisma.SesionLecturaGetPayload<{ include: typeof COMPLETA }>;

const ACTIVAS: EstadoSesion[] = ['INICIADA', 'EN_CURSO'];

const esChoqueUnico = (error: unknown) => (error as { code?: string })?.code === 'P2002';

function aDominio(f: Fila): SesionLectura {
  return SesionLectura.desdePersistencia({
    id: f.id,
    estudianteId: f.estudianteId,
    lecturaId: f.lecturaId,
    versionLecturaId: f.versionLecturaId,
    asignacionId: f.asignacionId,
    estado: f.estado as EstadoSesion,
    prediccion: f.prediccion,
    reflexion: f.reflexion,
    itemActualId: f.itemActualId,
    esRepeticion: f.esRepeticion,
    iniciadaEn: f.iniciadaEn,
    ultimaActividadEn: f.ultimaActividadEn,
    finalizadaEn: f.finalizadaEn,
    respuestas: f.respuestas.map(
      (r): RespuestaItem => ({
        id: r.id,
        itemId: r.itemId,
        habilidad: r.habilidad,
        modalidad: r.modalidad as Modalidad,
        contenido: r.contenido as RespuestaItem['contenido'],
        esCorrecta: r.esCorrecta,
        pistasUsadas: r.pistasUsadas,
        puntajeItem: r.puntajeItem === null ? null : Number(r.puntajeItem),
        estado: r.estado as EstadoRespuesta,
        idempotencyKey: r.idempotencyKey,
        respondidaEn: r.respondidaEn,
        usos: [...r.usosPista].sort((a, b) => a.usadaEn.getTime() - b.usadaEn.getTime()).map((u) => ({ nivel: u.nivel as NivelUso, usadaEn: u.usadaEn })),
        justificacion: r.justificacion
          ? {
              modalidad: r.justificacion.modalidad as 'ESCRITURA' | 'SELECCION',
              texto: r.justificacion.texto,
              opcionElegida: r.justificacion.opcionElegida as { indices: number[]; texto: string } | null,
              creadaEn: r.justificacion.creadaEn,
            }
          : null,
        valoracion: r.valoracion
          ? { docenteId: r.valoracion.docenteId, nivel: r.valoracion.nivel, comentario: r.valoracion.comentario, valoradaEn: r.valoracion.valoradaEn }
          : null,
      }),
    ),
    decisiones: f.decisiones.map((d) => ({ id: d.id, nodoOrigenId: d.nodoOrigenId, nodoDestinoId: d.nodoDestinoId, decididaEn: d.decididaEn })),
  });
}

/** Adaptador de persistencia de las sesiones de lectura sobre el schema `lectura` (SRS §7). */
export class PrismaSesionRepository implements SesionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async buscar(id: string): Promise<SesionLectura | null> {
    if (!esUuid(id)) return null;
    const f = await this.prisma.sesionLectura.findUnique({ where: { id }, include: COMPLETA });
    return f ? aDominio(f) : null;
  }

  async buscarPorRespuesta(respuestaId: string): Promise<SesionLectura | null> {
    if (!esUuid(respuestaId)) return null;
    const r = await this.prisma.respuesta.findUnique({ where: { id: respuestaId }, select: { sesionId: true } });
    return r ? this.buscar(r.sesionId) : null;
  }

  async activaDe(estudianteId: string, lecturaId: string): Promise<SesionLectura | null> {
    if (!esUuid(lecturaId)) return null;
    const f = await this.prisma.sesionLectura.findFirst({ where: { estudianteId, lecturaId, estado: { in: ACTIVAS } }, include: COMPLETA });
    return f ? aDominio(f) : null;
  }

  async crear(s: SesionLectura): Promise<boolean> {
    const p = s.propsSnapshot;
    try {
      await this.prisma.sesionLectura.create({
        data: {
          id: p.id,
          estudianteId: p.estudianteId,
          lecturaId: p.lecturaId,
          versionLecturaId: p.versionLecturaId,
          asignacionId: p.asignacionId,
          estado: p.estado,
          esRepeticion: p.esRepeticion,
          iniciadaEn: p.iniciadaEn,
          ultimaActividadEn: p.ultimaActividadEn,
        },
      });
      return true;
    } catch (error) {
      if (esChoqueUnico(error)) return false; // sesion_lectura_una_activa_por_lectura
      throw error;
    }
  }

  /** Guarda la sesión y, en la misma transacción, lo que cambió en sus respuestas y decisiones. */
  async guardar(s: SesionLectura): Promise<void> {
    const p = s.propsSnapshot;
    const { respuestas, decisiones } = s.cambios();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.sesionLectura.update({
          where: { id: p.id },
          data: {
            estado: p.estado,
            prediccion: p.prediccion,
            reflexion: p.reflexion,
            itemActualId: p.itemActualId,
            ultimaActividadEn: p.ultimaActividadEn,
            finalizadaEn: p.finalizadaEn,
          },
        });
        for (const r of respuestas) {
          const datos = {
            habilidad: r.habilidad,
            modalidad: r.modalidad,
            contenido: r.contenido as Prisma.InputJsonValue,
            esCorrecta: r.esCorrecta,
            pistasUsadas: r.pistasUsadas,
            puntajeItem: r.puntajeItem,
            estado: r.estado,
            idempotencyKey: r.idempotencyKey,
            respondidaEn: r.respondidaEn,
          };
          await tx.respuesta.upsert({
            where: { sesionId_itemId: { sesionId: p.id, itemId: r.itemId } },
            create: { id: r.id, sesionId: p.id, itemId: r.itemId, ...datos },
            update: datos,
          });
          if (r.usos.length > 0) {
            await tx.usoPista.createMany({ data: r.usos.map((u) => ({ respuestaId: r.id, nivel: u.nivel, usadaEn: u.usadaEn })), skipDuplicates: true });
          }
          if (r.justificacion) {
            const j = r.justificacion;
            await tx.justificacion.upsert({
              where: { respuestaId: r.id },
              create: { respuestaId: r.id, modalidad: j.modalidad, texto: j.texto, opcionElegida: j.opcionElegida ?? Prisma.DbNull, creadaEn: j.creadaEn },
              update: {},
            });
          }
          if (r.valoracion) {
            const v = r.valoracion;
            await tx.valoracionRubrica.upsert({
              where: { respuestaId: r.id },
              create: { respuestaId: r.id, docenteId: v.docenteId, nivel: v.nivel, comentario: v.comentario, valoradaEn: v.valoradaEn },
              update: {},
            });
          }
        }
        if (decisiones.length > 0) {
          await tx.decisionRuta.createMany({
            data: decisiones.map((d) => ({ id: d.id, sesionId: p.id, nodoOrigenId: d.nodoOrigenId, nodoDestinoId: d.nodoDestinoId, decididaEn: d.decididaEn })),
          });
        }
      });
    } catch (error) {
      // La clave de idempotencia la genera el navegador: si coincide con la de otra respuesta, se pide reenviar.
      if (esChoqueUnico(error)) throw new ErrorDeNegocio('No pudimos guardar tu respuesta: vuelve a enviarla', 'CONFLICTO');
      throw error;
    }
    s.confirmarCambios();
  }

  async tieneFinalizada(estudianteId: string, lecturaId: string): Promise<boolean> {
    return (await this.prisma.sesionLectura.count({ where: { estudianteId, lecturaId, estado: 'FINALIZADA' } })) > 0;
  }

  async avanceDe(estudianteId: string, lecturaIds: string[], activaDesde: Date): Promise<Map<string, 'EN_CURSO' | 'FINALIZADA'>> {
    const ids = lecturaIds.filter(esUuid);
    const avance = new Map<string, 'EN_CURSO' | 'FINALIZADA'>();
    if (ids.length === 0) return avance;
    const filas = await this.prisma.sesionLectura.findMany({
      where: {
        estudianteId,
        lecturaId: { in: ids },
        OR: [{ estado: 'FINALIZADA' }, { estado: { in: ACTIVAS }, ultimaActividadEn: { gte: activaDesde } }],
      },
      select: { lecturaId: true, estado: true },
    });
    for (const f of filas) {
      if (f.estado === 'FINALIZADA') avance.set(f.lecturaId, 'FINALIZADA');
      else if (!avance.has(f.lecturaId)) avance.set(f.lecturaId, 'EN_CURSO');
    }
    return avance;
  }

  async conRespuestasAbiertas(estudianteIds: string[], estado: EstadoRespuesta): Promise<SesionLectura[]> {
    if (estudianteIds.length === 0) return [];
    const filas = await this.prisma.sesionLectura.findMany({
      where: { estudianteId: { in: estudianteIds }, respuestas: { some: { estado } } },
      include: COMPLETA,
      orderBy: { iniciadaEn: 'asc' },
      take: 300,
    });
    return filas.map(aDominio);
  }
}
