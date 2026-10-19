import { Prisma } from '@prisma/client';

import { esUuid, PrismaService } from '../../../shared-kernel/public-api';
import { FiltroBiblioteca, LecturaRepository, ResumenLectura } from '../../application/ports/lectura.repository';
import { Lectura } from '../../domain/entities/lectura';
import { EstadoVersion, Recurso, TipoRecurso, VersionLectura } from '../../domain/entities/version-lectura';
import { Actividad, ContenidoItem, Item, Modalidad, Momento, NivelPista, TipoActividad } from '../../domain/services/actividades';
import { OpcionNodo } from '../../domain/services/grafo-historia';
import { Habilidad, MetadatosLectura } from '../../domain/value-objects/metadatos-lectura';

const CON_HIJOS = {
  oraciones: true,
  recursos: true,
  nodos: true,
  actividades: { include: { items: { include: { pistas: true, claves: true } } } },
} satisfies Prisma.VersionLecturaInclude;

type FilaVersion = Prisma.VersionLecturaGetPayload<{ include: typeof CON_HIJOS }>;

const codificar = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const decodificar = (c: string): { t: string; i: string } | null => {
  try {
    const o = JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as { t?: unknown; i?: unknown };
    return typeof o.t === 'string' && typeof o.i === 'string' ? { t: o.t, i: o.i } : null;
  } catch {
    return null;
  }
};

/**
 * Adaptador: lecturas y versiones en el schema `contenido`. Un borrador se reescribe completo (con
 * los mismos ids) en una transacción; una versión en revisión, publicada o archivada es inmutable
 * (RN-14) y solo cambian sus campos de estado.
 */
export class PrismaLecturaRepository implements LecturaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async guardarLectura(l: Lectura): Promise<void> {
    const p = l.propsSnapshot;
    const datos = { autorId: p.autorId, versionPublicadaId: p.versionPublicadaId, archivadaEn: p.archivadaEn };
    await this.prisma.lectura.upsert({ where: { id: p.id }, update: datos, create: { id: p.id, creadaEn: p.creadaEn, ...datos } });
  }

  async buscarLectura(id: string): Promise<Lectura | null> {
    const f = esUuid(id) ? await this.prisma.lectura.findUnique({ where: { id } }) : null;
    return f ? Lectura.desdePersistencia({ ...f }) : null;
  }

  async guardarVersion(v: VersionLectura): Promise<void> {
    const p = v.propsSnapshot;
    const m = p.metadatos;
    const escalares = {
      lecturaId: p.lecturaId,
      numero: p.numero,
      estado: p.estado,
      titulo: m.titulo,
      rangoEdad: m.rangoEdad,
      nivelDificultad: m.nivelDificultad,
      tematica: m.tematica,
      tipoTexto: m.tipoTexto,
      habilidadesObjetivo: [...m.habilidadesObjetivo],
      licencia: m.licencia,
      texto: v.texto,
      autorId: p.autorId,
      revisorId: p.revisorId,
      esRamificada: v.esRamificada,
      comentarioRevision: p.comentarioRevision,
      enviadaRevisionEn: p.enviadaRevisionEn,
      publicadaEn: p.publicadaEn,
      archivadaEn: p.archivadaEn,
    };
    await this.prisma.$transaction(async (tx) => {
      const guardada = await tx.versionLectura.findUnique({ where: { id: p.id }, select: { estado: true } });
      await tx.versionLectura.upsert({ where: { id: p.id }, update: escalares, create: { id: p.id, creadaEn: p.creadaEn, ...escalares } });
      if (guardada && guardada.estado !== 'BORRADOR') return;

      const deLaVersion = { where: { versionLecturaId: p.id } };
      await tx.actividad.deleteMany(deLaVersion); // arrastra ítems, pistas y evidencias
      await tx.nodoHistoria.deleteMany(deLaVersion);
      await tx.recurso.deleteMany(deLaVersion);
      await tx.oracion.deleteMany(deLaVersion);

      await tx.oracion.createMany({ data: p.oraciones.map((o) => ({ id: o.id, versionLecturaId: p.id, orden: o.orden, parrafo: o.parrafo, texto: o.texto })) });
      await tx.actividad.createMany({
        data: p.actividades.map((a) => ({ id: a.id, versionLecturaId: p.id, momento: a.momento, tipo: a.tipo, orden: a.orden, oracionAnclajeId: a.oracionAnclajeId })),
      });
      const items = p.actividades.flatMap((a) => a.items.map((it) => ({ a, it })));
      await tx.item.createMany({
        data: items.map(({ a, it }) => ({
          id: it.id,
          actividadId: a.id,
          orden: it.orden,
          habilidad: it.habilidad,
          nivelDificultad: it.nivelDificultad,
          modalidad: it.modalidad,
          esCerrado: it.esCerrado,
          enunciado: it.enunciado,
          contenido: it.contenido as Prisma.InputJsonValue,
          respuestaCorrecta: it.respuestaCorrecta ?? Prisma.DbNull,
          explicacionModelada: it.explicacionModelada,
        })),
      });
      await tx.pista.createMany({ data: items.flatMap(({ it }) => it.pistas.map((x) => ({ itemId: it.id, nivel: x.nivel, texto: x.texto }))) });
      await tx.claveEvidencia.createMany({ data: items.flatMap(({ it }) => it.clavesEvidencia.map((oracionId) => ({ itemId: it.id, oracionId }))) });
      await tx.recurso.createMany({
        data: p.recursos.map((r) => ({
          id: r.id,
          versionLecturaId: p.id,
          tipo: r.tipo,
          claveAlmacen: r.claveAlmacen,
          tipoMime: r.tipoMime,
          bytes: r.bytes,
          textoAlternativo: r.textoAlternativo,
          duracionSeg: r.duracionSeg,
          creadoEn: r.creadoEn,
        })),
      });
      await tx.nodoHistoria.createMany({
        data: p.nodos.map((n) => ({
          id: n.id,
          versionLecturaId: p.id,
          clave: n.clave,
          contenido: n.contenido,
          esInicio: n.esInicio,
          esFinal: n.esFinal,
          opciones: n.opciones as unknown as Prisma.InputJsonValue,
        })),
      });
    });
  }

  async buscarVersion(id: string): Promise<VersionLectura | null> {
    const f = esUuid(id) ? await this.prisma.versionLectura.findUnique({ where: { id }, include: CON_HIJOS }) : null;
    return f ? this.aDominio(f) : null;
  }

  async versionesDe(lecturaId: string): Promise<VersionLectura[]> {
    if (!esUuid(lecturaId)) return [];
    const filas = await this.prisma.versionLectura.findMany({ where: { lecturaId }, include: CON_HIJOS, orderBy: { numero: 'asc' } });
    return filas.map((f) => this.aDominio(f));
  }

  async listarResumen(): Promise<ResumenLectura[]> {
    const filas = await this.prisma.lectura.findMany({
      include: { versiones: { orderBy: { numero: 'desc' }, take: 1 } },
      orderBy: { creadaEn: 'desc' },
    });
    return filas.flatMap((l) => {
      const v = l.versiones[0];
      if (!v) return [];
      return [{
        lecturaId: l.id,
        versionId: v.id,
        numero: v.numero,
        estado: v.estado as EstadoVersion,
        titulo: v.titulo,
        rangoEdad: v.rangoEdad,
        nivelDificultad: v.nivelDificultad,
        autorId: v.autorId,
        tienePublicada: !!l.versionPublicadaId,
        archivada: !!l.archivadaEn,
        actualizadaEn: v.publicadaEn ?? v.enviadaRevisionEn ?? v.creadaEn,
      }];
    });
  }

  async biblioteca(f: FiltroBiblioteca): Promise<{ versiones: VersionLectura[]; siguiente: string | null }> {
    const cursor = f.cursor ? decodificar(f.cursor) : null;
    const where: Prisma.VersionLecturaWhereInput = {
      estado: 'PUBLICADO',
      publicadaEnLectura: { is: { archivadaEn: null } },
      ...(f.rangos ? { rangoEdad: { in: f.rangos } } : {}),
      ...(f.niveles ? { nivelDificultad: { in: f.niveles } } : {}),
      ...(f.tema ? { tematica: { contains: f.tema, mode: 'insensitive' } } : {}),
      ...(f.tipo ? { tipoTexto: f.tipo } : {}),
      ...(f.habilidad ? { habilidadesObjetivo: { has: f.habilidad } } : {}),
      ...(cursor ? { OR: [{ titulo: { gt: cursor.t } }, { titulo: cursor.t, id: { gt: cursor.i } }] } : {}),
    };
    const filas = await this.prisma.versionLectura.findMany({
      where,
      include: CON_HIJOS,
      orderBy: [{ titulo: 'asc' }, { id: 'asc' }],
      take: f.limite + 1,
    });
    const pagina = filas.slice(0, f.limite);
    const ultima = pagina[pagina.length - 1];
    return {
      versiones: pagina.map((x) => this.aDominio(x)),
      siguiente: filas.length > f.limite && ultima ? codificar({ t: ultima.titulo, i: ultima.id }) : null,
    };
  }

  async buscarRecurso(id: string): Promise<{ recurso: Recurso; versionId: string; estado: EstadoVersion } | null> {
    if (!esUuid(id)) return null;
    const f = await this.prisma.recurso.findUnique({ where: { id }, include: { versionLectura: { select: { estado: true } } } });
    return f ? { recurso: this.recurso(f), versionId: f.versionLecturaId, estado: f.versionLectura.estado as EstadoVersion } : null;
  }

  private recurso(r: FilaVersion['recursos'][number]): Recurso {
    return {
      id: r.id,
      tipo: r.tipo as TipoRecurso,
      claveAlmacen: r.claveAlmacen,
      tipoMime: r.tipoMime,
      bytes: r.bytes,
      textoAlternativo: r.textoAlternativo,
      duracionSeg: r.duracionSeg,
      creadoEn: r.creadoEn,
    };
  }

  private aDominio(f: FilaVersion): VersionLectura {
    const actividades: Actividad[] = [...f.actividades]
      .sort((a, b) => a.orden - b.orden)
      .map((a) => ({
        id: a.id,
        momento: a.momento as Momento,
        tipo: a.tipo as TipoActividad,
        orden: a.orden,
        oracionAnclajeId: a.oracionAnclajeId,
        items: [...a.items]
          .sort((x, y) => x.orden - y.orden)
          .map((it): Item => ({
            id: it.id,
            orden: it.orden,
            habilidad: it.habilidad as Habilidad,
            nivelDificultad: it.nivelDificultad,
            modalidad: it.modalidad as Modalidad,
            esCerrado: it.esCerrado,
            enunciado: it.enunciado,
            contenido: it.contenido as ContenidoItem,
            respuestaCorrecta: it.respuestaCorrecta as Item['respuestaCorrecta'],
            explicacionModelada: it.explicacionModelada,
            pistas: it.pistas.map((x) => ({ nivel: x.nivel as NivelPista, texto: x.texto })).sort((x, y) => x.nivel.localeCompare(y.nivel)),
            clavesEvidencia: it.claves.map((c) => c.oracionId),
          })),
      }));
    return VersionLectura.desdePersistencia({
      id: f.id,
      lecturaId: f.lecturaId,
      numero: f.numero,
      estado: f.estado as EstadoVersion,
      metadatos: MetadatosLectura.de({
        titulo: f.titulo,
        rangoEdad: f.rangoEdad,
        nivelDificultad: f.nivelDificultad,
        tematica: f.tematica,
        tipoTexto: f.tipoTexto,
        habilidadesObjetivo: f.habilidadesObjetivo,
        licencia: f.licencia,
      }),
      autorId: f.autorId,
      revisorId: f.revisorId,
      oraciones: f.oraciones.map((o) => ({ id: o.id, orden: o.orden, parrafo: o.parrafo, texto: o.texto })).sort((a, b) => a.orden - b.orden),
      actividades,
      recursos: f.recursos.map((r) => this.recurso(r)),
      nodos: f.nodos.map((n) => ({
        id: n.id,
        clave: n.clave,
        contenido: n.contenido,
        esInicio: n.esInicio,
        esFinal: n.esFinal,
        opciones: n.opciones as unknown as OpcionNodo[],
      })),
      comentarioRevision: f.comentarioRevision,
      creadaEn: f.creadaEn,
      enviadaRevisionEn: f.enviadaRevisionEn,
      publicadaEn: f.publicadaEn,
      archivadaEn: f.archivadaEn,
    });
  }
}
