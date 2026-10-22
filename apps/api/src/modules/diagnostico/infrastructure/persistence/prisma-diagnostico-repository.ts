import { Prisma } from '@prisma/client';

import { esUuid, Habilidad, PrismaService, RangoEdad } from '../../../shared-kernel/public-api';
import { BancoItems, DiagnosticoRepository } from '../../application/ports/diagnostico.ports';
import { Diagnostico, ResultadoDiagnostico } from '../../domain/entities/diagnostico';
import { ItemDiagnostico } from '../../domain/entities/item-diagnostico';
import { ItemFueraDeOrdenError } from '../../domain/errors/errores-diagnostico';
import { EstadoDiagnostico, Forma, TipoDiagnostico } from '../../domain/value-objects/plan-diagnostico';

const CON_RESPUESTAS = { respuestas: { orderBy: { respondidaEn: 'asc' as const } } };

type Fila = Prisma.DiagnosticoGetPayload<{ include: typeof CON_RESPUESTAS }>;

const esChoqueUnico = (error: unknown) => (error as { code?: string })?.code === 'P2002';

/** Adaptador de persistencia del Diagnóstico sobre el schema `diagnostico` (SRS §7). */
export class PrismaDiagnosticoRepository implements DiagnosticoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async buscar(id: string): Promise<Diagnostico | null> {
    if (!esUuid(id)) return null;
    const fila = await this.prisma.diagnostico.findUnique({ where: { id }, include: CON_RESPUESTAS });
    return fila ? aDiagnostico(fila) : null;
  }

  async crear(d: Diagnostico): Promise<boolean> {
    const p = d.snapshot;
    try {
      await this.prisma.diagnostico.create({
        data: {
          id: p.id, estudianteId: p.estudianteId, tipo: p.tipo, secuencia: p.secuencia, estado: p.estado, rangoEdad: p.rangoEdad,
          totalItems: p.totalItems, asignadoPor: p.asignadoPor,
        },
      });
      return true;
    } catch (error) {
      // Único por (estudiante, tipo, secuencia) y un solo reto sin terminar por estudiante.
      if (esChoqueUnico(error)) return false;
      throw error;
    }
  }

  async guardar(d: Diagnostico): Promise<void> {
    const p = d.snapshot;
    const guardadas = new Set((await this.prisma.respuestaDiagnostico.findMany({ where: { diagnosticoId: p.id }, select: { itemId: true } })).map((r) => r.itemId));
    const nuevas = p.respuestas.filter((r) => !guardadas.has(r.itemId));
    try {
      await this.prisma.$transaction([
        this.prisma.diagnostico.update({
          where: { id: p.id },
          data: {
            estado: p.estado,
            resultado: p.resultado ? (p.resultado as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            iniciadoEn: p.iniciadoEn,
            pausadoEn: p.pausadoEn,
            finalizadoEn: p.finalizadoEn,
          },
        }),
        this.prisma.respuestaDiagnostico.createMany({
          data: nuevas.map((r) => ({ diagnosticoId: p.id, itemId: r.itemId, contenido: { indice: r.indice }, esCorrecta: r.esCorrecta, respondidaEn: r.respondidaEn })),
        }),
      ]);
    } catch (error) {
      // La misma pregunta respondida dos veces a la vez (doble toque): la segunda no cuenta.
      if (esChoqueUnico(error)) throw new ItemFueraDeOrdenError();
      throw error;
    }
  }

  async pendienteDe(estudianteId: string): Promise<Diagnostico | null> {
    const fila = await this.prisma.diagnostico.findFirst({ where: { estudianteId, estado: { not: 'FINALIZADO' } }, include: CON_RESPUESTAS });
    return fila ? aDiagnostico(fila) : null;
  }

  async inicialDe(estudianteId: string): Promise<Diagnostico | null> {
    const fila = await this.prisma.diagnostico.findUnique({
      where: { estudianteId_tipo_secuencia: { estudianteId, tipo: 'INICIAL', secuencia: 1 } },
      include: CON_RESPUESTAS,
    });
    return fila ? aDiagnostico(fila) : null;
  }

  async ultimaSecuencia(estudianteId: string, tipo: TipoDiagnostico): Promise<number> {
    const r = await this.prisma.diagnostico.aggregate({ where: { estudianteId, tipo }, _max: { secuencia: true } });
    return r._max.secuencia ?? 0;
  }

  async deEstudiantes(estudianteIds: string[]): Promise<Diagnostico[]> {
    if (estudianteIds.length === 0) return [];
    const filas = await this.prisma.diagnostico.findMany({ where: { estudianteId: { in: estudianteIds } }, include: CON_RESPUESTAS });
    return filas.map(aDiagnostico);
  }
}

function aDiagnostico(f: Fila): Diagnostico {
  return Diagnostico.desdePersistencia({
    id: f.id,
    estudianteId: f.estudianteId,
    tipo: f.tipo as TipoDiagnostico,
    secuencia: f.secuencia,
    estado: f.estado as EstadoDiagnostico,
    rangoEdad: f.rangoEdad as RangoEdad,
    totalItems: f.totalItems,
    asignadoPor: f.asignadoPor,
    respuestas: f.respuestas.map((r) => ({ itemId: r.itemId, indice: Number((r.contenido as { indice?: number }).indice), esCorrecta: r.esCorrecta, respondidaEn: r.respondidaEn })),
    resultado: (f.resultado as unknown as ResultadoDiagnostico | null) ?? null,
    iniciadoEn: f.iniciadoEn,
    pausadoEn: f.pausadoEn,
    finalizadoEn: f.finalizadoEn,
  });
}

/**
 * Banco de ítems: solo cambia con una migración (y por lo tanto con un despliegue), así que se
 * guarda en memoria por edad y forma.
 */
export class PrismaBancoItems implements BancoItems {
  private readonly cache = new Map<string, Promise<ItemDiagnostico[]>>();

  constructor(private readonly prisma: PrismaService) {}

  items(rangoEdad: RangoEdad, forma: Forma): Promise<ItemDiagnostico[]> {
    const clave = `${rangoEdad}|${forma}`;
    let items = this.cache.get(clave);
    if (!items) {
      items = this.cargar(rangoEdad, forma);
      items.catch(() => this.cache.delete(clave));
      this.cache.set(clave, items);
    }
    return items;
  }

  private async cargar(rangoEdad: RangoEdad, forma: Forma): Promise<ItemDiagnostico[]> {
    const filas = await this.prisma.bancoItemDiagnostico.findMany({ where: { rangoEdad, forma, activo: true } });
    return filas
      .map((f) => {
        const c = f.contenido as { orden: number; lectura: ItemDiagnostico['lectura']; opciones: string[] };
        return {
          id: f.id,
          rangoEdad: f.rangoEdad as RangoEdad,
          forma: f.forma as Forma,
          orden: c.orden,
          habilidad: f.habilidad as Habilidad,
          nivelDificultad: f.nivelDificultad,
          enunciado: f.enunciado,
          lectura: c.lectura,
          opciones: c.opciones,
          indiceCorrecto: (f.respuestaCorrecta as { indice: number }).indice,
        };
      })
      .sort((a, b) => a.orden - b.orden);
  }
}
