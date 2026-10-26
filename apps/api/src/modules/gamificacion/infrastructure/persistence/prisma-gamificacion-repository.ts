import { Prisma } from '@prisma/client';

import { esHabilidad, PrismaService } from '../../../shared-kernel/public-api';
import { ClaveEvento, GamificacionRepository, RecompensaCatalogo, ResumenCuenta } from '../../application/ports/gamificacion.ports';
import { CuentaGamificacion, EstadoCuenta } from '../../domain/entities/cuenta-gamificacion';
import { DatosReto, EstadoReto, LecturaSugerida, RetoDiario } from '../../domain/entities/reto-diario';
import { monedasDisponibles, SaldoMonedas } from '../../domain/services/monedas';
import { leerParametros, PARAMETROS_POR_DEFECTO, ParametrosGamificacion } from '../../domain/services/parametros';
import { MotivoPuntos } from '../../domain/services/politica-puntos';
import { EstadoRacha, RACHA_VACIA } from '../../domain/services/racha';
import { InsigniaCatalogo, leerRegla, ordenarCatalogo } from '../../domain/services/reglas-insignia';

type Tx = Prisma.TransactionClient;

/** Los catálogos (insignias y recompensas) los siembra la migración: se releen cada 5 minutos. */
const VIGENCIA_CATALOGO_MS = 5 * 60_000;
/** Bajo carga, varios logros del mismo niño esperan su turno en el candado. */
const OPCIONES_TX = { maxWait: 10_000, timeout: 15_000 };

const fechaDb = (fecha: string) => new Date(`${fecha}T00:00:00Z`);
const fechaTexto = (d: Date) => d.toISOString().slice(0, 10);

function lecturaDe(valor: unknown): LecturaSugerida | null {
  const l = valor as { id?: unknown; titulo?: unknown } | null;
  return l && typeof l.id === 'string' && typeof l.titulo === 'string' ? { id: l.id, titulo: l.titulo } : null;
}

function retoDesdeFila(f: {
  id: string;
  estudianteId: string;
  fechaLima: Date;
  habilidad: string;
  contenido: Prisma.JsonValue;
  estado: string;
  completadoEn: Date | null;
}): RetoDiario | null {
  if (!esHabilidad(f.habilidad)) return null;
  const c = (f.contenido ?? {}) as { meta?: number; avance?: number; lectura?: unknown };
  const datos: DatosReto = {
    id: f.id,
    estudianteId: f.estudianteId,
    fecha: fechaTexto(f.fechaLima),
    habilidad: f.habilidad,
    meta: Number.isInteger(c.meta) ? (c.meta as number) : 3,
    avance: Number.isInteger(c.avance) ? (c.avance as number) : 0,
    estado: f.estado as EstadoReto,
    completadoEn: f.completadoEn,
    lectura: lecturaDe(c.lectura),
  };
  return RetoDiario.desdePersistencia(datos);
}

function contenidoReto(d: Readonly<DatosReto>): Prisma.InputJsonObject {
  return { meta: d.meta, avance: d.avance, lectura: d.lectura ? { id: d.lectura.id, titulo: d.lectura.titulo } : null };
}

function rachaDesdeFila(f: { diasActuales: number; mejorRacha: number; ultimaFechaLima: Date | null; comodinUsadoSemana: Date | null } | null): EstadoRacha {
  if (!f) return { ...RACHA_VACIA };
  return {
    dias: f.diasActuales,
    mejor: f.mejorRacha,
    ultimaFecha: f.ultimaFechaLima ? fechaTexto(f.ultimaFechaLima) : null,
    comodinSemana: f.comodinUsadoSemana ? fechaTexto(f.comodinUsadoSemana) : null,
  };
}

/** Adaptador de persistencia de Gamificación sobre el schema `gamificacion` (SRS §7). */
export class PrismaGamificacionRepository implements GamificacionRepository {
  private insigniasCache: { valor: InsigniaCatalogo[]; hasta: number } | null = null;
  private recompensasCache: { valor: RecompensaCatalogo[]; hasta: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async parametros(): Promise<ParametrosGamificacion> {
    const fila = await this.prisma.parametroGamificacion.findFirst({ where: { vigenteDesde: { lte: new Date() } }, orderBy: { version: 'desc' } });
    return fila ? leerParametros(fila.version, fila.parametros) : PARAMETROS_POR_DEFECTO;
  }

  async insignias(): Promise<InsigniaCatalogo[]> {
    if (this.insigniasCache && this.insigniasCache.hasta > Date.now()) return this.insigniasCache.valor;
    const filas = await this.prisma.insignia.findMany({ where: { activa: true } });
    const valor = ordenarCatalogo(
      filas.flatMap((f) => {
        const regla = leerRegla(f.regla);
        return regla ? [{ id: f.id, codigo: f.codigo, nombre: f.nombre, descripcion: f.descripcion, regla }] : [];
      }),
    );
    this.insigniasCache = { valor, hasta: Date.now() + VIGENCIA_CATALOGO_MS };
    return valor;
  }

  async recompensas(): Promise<RecompensaCatalogo[]> {
    if (this.recompensasCache && this.recompensasCache.hasta > Date.now()) return this.recompensasCache.valor;
    const filas = await this.prisma.recompensa.findMany({ where: { activa: true }, orderBy: { orden: 'asc' } });
    const valor = filas.map((f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre, tipo: f.tipo as RecompensaCatalogo['tipo'], costo: f.costo }));
    this.recompensasCache = { valor, hasta: Date.now() + VIGENCIA_CATALOGO_MS };
    return valor;
  }

  aplicar(estudianteId: string, clave: ClaveEvento, hoy: string, operar: (estado: EstadoCuenta) => CuentaGamificacion): Promise<CuentaGamificacion | null> {
    return this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, estudianteId);
      // Idempotencia: si el outbox reentrega el evento, la fila ya existe y no se vuelve a aplicar.
      const { count } = await tx.eventoAplicado.createMany({ data: [{ tipo: clave.tipo, origenId: clave.origenId, estudianteId }], skipDuplicates: true });
      if (count === 0) return null;
      const cuenta = operar(await this.cargar(tx, estudianteId, hoy));
      await this.guardar(tx, estudianteId, cuenta);
      return cuenta;
    }, OPCIONES_TX);
  }

  async resumen(estudianteId: string, hoy: string): Promise<ResumenCuenta> {
    const [total, delDia, ganadas, avances, racha, canjes, ultimos] = await Promise.all([
      this.prisma.asientoPuntos.aggregate({ where: { estudianteId }, _sum: { puntos: true } }),
      this.prisma.asientoPuntos.aggregate({ where: { estudianteId, fechaLima: fechaDb(hoy) }, _sum: { puntos: true } }),
      this.prisma.insigniaOtorgada.findMany({ where: { estudianteId }, select: { insigniaId: true, otorgadaEn: true } }),
      this.prisma.avanceInsignia.findMany({ where: { estudianteId }, select: { insigniaId: true, avance: true } }),
      this.prisma.racha.findUnique({ where: { estudianteId } }),
      this.prisma.canjeRecompensa.findMany({ where: { estudianteId }, select: { recompensaId: true, monedas: true } }),
      this.prisma.asientoPuntos.findMany({ where: { estudianteId }, orderBy: { id: 'desc' }, take: 5, select: { motivo: true, puntos: true, creadoEn: true } }),
    ]);
    return {
      puntosTotales: total._sum.puntos ?? 0,
      puntosHoy: delDia._sum.puntos ?? 0,
      ganadas: new Map(ganadas.map((g) => [g.insigniaId, g.otorgadaEn])),
      avances: new Map(avances.map((a) => [a.insigniaId, a.avance])),
      racha: rachaDesdeFila(racha),
      monedasGastadas: canjes.reduce((s, c) => s + c.monedas, 0),
      canjeadas: new Set(canjes.map((c) => c.recompensaId)),
      ultimos: ultimos.map((u) => ({ motivo: u.motivo as MotivoPuntos, puntos: u.puntos, creadoEn: u.creadoEn })),
    };
  }

  async retoDe(estudianteId: string, fecha: string): Promise<RetoDiario | null> {
    const fila = await this.prisma.retoDiario.findUnique({ where: { estudianteId_fechaLima: { estudianteId, fechaLima: fechaDb(fecha) } } });
    return fila ? retoDesdeFila(fila) : null;
  }

  async proponerReto(reto: RetoDiario): Promise<RetoDiario> {
    const d = reto.datos;
    await this.prisma.retoDiario.updateMany({
      where: { estudianteId: d.estudianteId, estado: 'PROPUESTO', fechaLima: { lt: fechaDb(d.fecha) } },
      data: { estado: 'VENCIDO' },
    });
    // RN-18: si dos pedidos llegan a la vez, gana el primero y ambos ven el mismo reto.
    await this.prisma.retoDiario.createMany({
      data: [{ id: d.id, estudianteId: d.estudianteId, fechaLima: fechaDb(d.fecha), habilidad: d.habilidad, contenido: contenidoReto(d), estado: d.estado }],
      skipDuplicates: true,
    });
    return (await this.retoDe(d.estudianteId, d.fecha)) ?? reto;
  }

  canjear(
    estudianteId: string,
    recompensa: RecompensaCatalogo,
    canje: { id: string; ahora: Date },
    validar: (saldo: SaldoMonedas & { yaEsTuya: boolean }) => void,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, estudianteId);
      const [total, gastadas, ya] = await Promise.all([
        tx.asientoPuntos.aggregate({ where: { estudianteId }, _sum: { puntos: true } }),
        tx.canjeRecompensa.aggregate({ where: { estudianteId }, _sum: { monedas: true } }),
        tx.canjeRecompensa.findUnique({ where: { estudianteId_recompensaId: { estudianteId, recompensaId: recompensa.id } } }),
      ]);
      const saldo = { puntosTotales: total._sum.puntos ?? 0, gastadas: gastadas._sum.monedas ?? 0 };
      validar({ ...saldo, yaEsTuya: ya !== null });
      await tx.canjeRecompensa.create({ data: { id: canje.id, estudianteId, recompensaId: recompensa.id, monedas: recompensa.costo, canjeadoEn: canje.ahora } });
      return monedasDisponibles({ puntosTotales: saldo.puntosTotales, gastadas: saldo.gastadas + recompensa.costo });
    }, OPCIONES_TX);
  }

  /** Un candado por estudiante hasta el fin de la transacción: sus logros se aplican de a uno (tope diario, racha). */
  private async bloquear(tx: Tx, estudianteId: string): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${estudianteId}, 0))`;
  }

  private async cargar(tx: Tx, estudianteId: string, hoy: string): Promise<EstadoCuenta> {
    const [total, delDia, ganadas, avances, racha, reto] = await Promise.all([
      tx.asientoPuntos.aggregate({ where: { estudianteId }, _sum: { puntos: true } }),
      tx.asientoPuntos.aggregate({ where: { estudianteId, fechaLima: fechaDb(hoy) }, _sum: { puntos: true } }),
      tx.insigniaOtorgada.findMany({ where: { estudianteId }, select: { insigniaId: true } }),
      tx.avanceInsignia.findMany({ where: { estudianteId }, select: { insigniaId: true, avance: true } }),
      tx.racha.findUnique({ where: { estudianteId } }),
      tx.retoDiario.findUnique({ where: { estudianteId_fechaLima: { estudianteId, fechaLima: fechaDb(hoy) } } }),
    ]);
    return {
      estudianteId,
      hoy,
      puntosTotales: total._sum.puntos ?? 0,
      puntosHoy: delDia._sum.puntos ?? 0,
      ganadas: new Set(ganadas.map((g) => g.insigniaId)),
      avances: new Map(avances.map((a) => [a.insigniaId, a.avance])),
      racha: rachaDesdeFila(racha),
      reto: reto ? retoDesdeFila(reto) : null,
    };
  }

  private async guardar(tx: Tx, estudianteId: string, cuenta: CuentaGamificacion): Promise<void> {
    const c = cuenta.cambios();
    if (c.asientos.length > 0) {
      await tx.asientoPuntos.createMany({
        data: c.asientos.map((a) => ({ estudianteId, puntos: a.puntos, motivo: a.motivo, eventoOrigen: a.origenId, fechaLima: fechaDb(a.fechaLima) })),
        skipDuplicates: true,
      });
    }
    if (c.insignias.length > 0) {
      await tx.insigniaOtorgada.createMany({
        data: c.insignias.map((i) => ({ estudianteId, insigniaId: i.insignia.id, eventoOrigen: i.origenId, otorgadaEn: i.otorgadaEn })),
        skipDuplicates: true,
      });
    }
    for (const a of c.avances) {
      await tx.avanceInsignia.upsert({
        where: { estudianteId_insigniaId: { estudianteId, insigniaId: a.insigniaId } },
        create: { estudianteId, insigniaId: a.insigniaId, avance: a.avance },
        update: { avance: a.avance, actualizadoEn: new Date() },
      });
    }
    if (c.racha) {
      const datos = {
        diasActuales: c.racha.dias,
        mejorRacha: c.racha.mejor,
        ultimaFechaLima: c.racha.ultimaFecha ? fechaDb(c.racha.ultimaFecha) : null,
        comodinUsadoSemana: c.racha.comodinSemana ? fechaDb(c.racha.comodinSemana) : null,
        actualizadaEn: new Date(),
      };
      await tx.racha.upsert({ where: { estudianteId }, create: { estudianteId, ...datos }, update: datos });
    }
    if (c.reto) {
      const d = c.reto.datos;
      await tx.retoDiario.update({ where: { id: d.id }, data: { contenido: contenidoReto(d), estado: d.estado, completadoEn: d.completadoEn } });
    }
  }
}
