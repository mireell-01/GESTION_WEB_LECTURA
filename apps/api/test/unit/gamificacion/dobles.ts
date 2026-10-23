/**
 * Dobles de prueba de Gamificación: repositorio en memoria con las mismas barreras que la base (cada
 * evento se aplica una vez, asiento único por origen y motivo, un reto por día, un canje por recompensa)
 * y las fuentes del shared-kernel (IAM, maestría, fichas, avance, lecturas y mundos) simuladas.
 */
import type {
  AvanceLectura,
  FichaLecturaPublicada,
  FuenteFichasLectura,
  LecturaRealizada,
  Maestrias,
  MundoCompletado,
  RangoEdad,
  ResolutorAvanceLecturas,
  ResolutorLecturasRealizadas,
  ResolutorMaestria,
  ResolutorMundosCompletados,
} from '../../../src/modules/shared-kernel/public-api';
import type {
  ClaveEvento,
  GamificacionRepository,
  IdentidadEstudiantes,
  RecompensaCatalogo,
  ResumenCuenta,
} from '../../../src/modules/gamificacion/application/ports/gamificacion.ports';
import { LogrosUseCase } from '../../../src/modules/gamificacion/application/use-cases/logros.use-case';
import { PasaporteUseCase } from '../../../src/modules/gamificacion/application/use-cases/pasaporte.use-case';
import { CuentaGamificacion, EstadoCuenta } from '../../../src/modules/gamificacion/domain/entities/cuenta-gamificacion';
import { RetoDiario } from '../../../src/modules/gamificacion/domain/entities/reto-diario';
import { SaldoMonedas } from '../../../src/modules/gamificacion/domain/services/monedas';
import { PARAMETROS_POR_DEFECTO, ParametrosGamificacion } from '../../../src/modules/gamificacion/domain/services/parametros';
import { MotivoPuntos } from '../../../src/modules/gamificacion/domain/services/politica-puntos';
import { EstadoRacha, RACHA_VACIA } from '../../../src/modules/gamificacion/domain/services/racha';
import { InsigniaCatalogo } from '../../../src/modules/gamificacion/domain/services/reglas-insignia';
import { BusEspia, Reloj } from '../iam/dobles';

/** El catálogo que siembra la migración (subconjunto suficiente para las reglas). */
export const CATALOGO: InsigniaCatalogo[] = [
  { id: 'i-primera', codigo: 'PRIMERA_LECTURA', nombre: 'Primera lectura', descripcion: '', regla: { tipo: 'LECTURAS', meta: 1 } },
  { id: 'i-detective', codigo: 'DETECTIVE_EVIDENCIAS', nombre: 'Detective de Evidencias', descripcion: '', regla: { tipo: 'EVIDENCIAS', meta: 5 } },
  { id: 'i-maestro', codigo: 'MAESTRO_INFERENCIAS', nombre: 'Maestro de las Inferencias', descripcion: '', regla: { tipo: 'NIVEL_HABILIDAD', habilidad: 'INF', nivel: 'AD' } },
  { id: 'i-perseverante', codigo: 'LECTOR_PERSEVERANTE', nombre: 'Lector Perseverante', descripcion: '', regla: { tipo: 'RACHA', dias: 7 } },
  { id: 'i-detective-rango', codigo: 'RANGO_DETECTIVE', nombre: 'Rango Detective', descripcion: '', regla: { tipo: 'MUNDO', numero: 2 } },
];

export const RECOMPENSAS: RecompensaCatalogo[] = [
  { id: 'r-lupa', codigo: 'LUPA', nombre: 'Lupa de detective', tipo: 'ACCESORIO', costo: 5 },
  { id: 'r-llama', codigo: 'LLAMA', nombre: 'Llama', tipo: 'PERSONAJE', costo: 20 },
];

interface Asiento {
  estudianteId: string;
  motivo: MotivoPuntos;
  puntos: number;
  origenId: string;
  fechaLima: string;
  creadoEn: Date;
}

export class GamificacionEnMemoria implements GamificacionRepository {
  readonly aplicados = new Set<string>();
  readonly asientos: Asiento[] = [];
  readonly ganadas = new Map<string, Map<string, Date>>();
  readonly avances = new Map<string, Map<string, number>>();
  readonly rachas = new Map<string, EstadoRacha>();
  readonly retos = new Map<string, RetoDiario>();
  readonly canjes: { estudianteId: string; recompensaId: string; monedas: number }[] = [];
  p: ParametrosGamificacion = PARAMETROS_POR_DEFECTO;
  catalogo: InsigniaCatalogo[] = CATALOGO;

  async parametros() {
    return this.p;
  }

  async insignias() {
    return this.catalogo;
  }

  async recompensas() {
    return RECOMPENSAS;
  }

  /** Comprueba y escribe sin ceder el turno, como la transacción con candado de la base. */
  async aplicar(estudianteId: string, clave: ClaveEvento, hoy: string, operar: (estado: EstadoCuenta) => CuentaGamificacion) {
    const llave = `${clave.tipo}:${clave.origenId}`;
    if (this.aplicados.has(llave)) return null;
    this.aplicados.add(llave);
    const reto = this.retos.get(`${estudianteId}:${hoy}`);
    const cuenta = operar({
      estudianteId,
      hoy,
      puntosTotales: this.total(estudianteId),
      puntosHoy: this.total(estudianteId, hoy),
      ganadas: new Set(this.ganadas.get(estudianteId)?.keys() ?? []),
      avances: new Map(this.avances.get(estudianteId) ?? []),
      racha: { ...(this.rachas.get(estudianteId) ?? RACHA_VACIA) },
      reto: reto ? RetoDiario.desdePersistencia({ ...reto.datos }) : null,
    });
    const c = cuenta.cambios();
    for (const a of c.asientos) {
      if (this.asientos.some((x) => x.origenId === a.origenId && x.motivo === a.motivo)) continue; // UNIQUE (evento_origen, motivo)
      this.asientos.push({ estudianteId, ...a, creadoEn: new Date() });
    }
    const ganadas = this.ganadas.get(estudianteId) ?? new Map<string, Date>();
    for (const i of c.insignias) if (!ganadas.has(i.insignia.id)) ganadas.set(i.insignia.id, i.otorgadaEn);
    this.ganadas.set(estudianteId, ganadas);
    const avances = this.avances.get(estudianteId) ?? new Map<string, number>();
    for (const a of c.avances) avances.set(a.insigniaId, a.avance);
    this.avances.set(estudianteId, avances);
    if (c.racha) this.rachas.set(estudianteId, c.racha);
    if (c.reto) this.retos.set(`${estudianteId}:${c.reto.datos.fecha}`, c.reto);
    return cuenta;
  }

  async resumen(estudianteId: string, hoy: string): Promise<ResumenCuenta> {
    const canjes = this.canjes.filter((c) => c.estudianteId === estudianteId);
    return {
      puntosTotales: this.total(estudianteId),
      puntosHoy: this.total(estudianteId, hoy),
      ganadas: new Map(this.ganadas.get(estudianteId) ?? []),
      avances: new Map(this.avances.get(estudianteId) ?? []),
      racha: { ...(this.rachas.get(estudianteId) ?? RACHA_VACIA) },
      monedasGastadas: canjes.reduce((s, c) => s + c.monedas, 0),
      canjeadas: new Set(canjes.map((c) => c.recompensaId)),
      ultimos: this.asientos.filter((a) => a.estudianteId === estudianteId).slice(-5).reverse(),
    };
  }

  async retoDe(estudianteId: string, fecha: string) {
    return this.retos.get(`${estudianteId}:${fecha}`) ?? null;
  }

  async proponerReto(reto: RetoDiario) {
    const llave = `${reto.datos.estudianteId}:${reto.datos.fecha}`;
    if (!this.retos.has(llave)) this.retos.set(llave, reto);
    return this.retos.get(llave) as RetoDiario;
  }

  async canjear(estudianteId: string, recompensa: RecompensaCatalogo, _canje: { id: string; ahora: Date }, validar: (s: SaldoMonedas & { yaEsTuya: boolean }) => void) {
    const propias = this.canjes.filter((c) => c.estudianteId === estudianteId);
    const saldo = { puntosTotales: this.total(estudianteId), gastadas: propias.reduce((s, c) => s + c.monedas, 0) };
    validar({ ...saldo, yaEsTuya: propias.some((c) => c.recompensaId === recompensa.id) });
    this.canjes.push({ estudianteId, recompensaId: recompensa.id, monedas: recompensa.costo });
    return Math.floor(saldo.puntosTotales / 10) - saldo.gastadas - recompensa.costo;
  }

  total(estudianteId: string, fecha?: string) {
    return this.asientos.filter((a) => a.estudianteId === estudianteId && (!fecha || a.fechaLima === fecha)).reduce((s, a) => s + a.puntos, 0);
  }

  motivos(estudianteId: string) {
    return this.asientos.filter((a) => a.estudianteId === estudianteId).map((a) => `${a.motivo}:${a.puntos}`);
  }
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly perfiles = new Map<string, { alias: string; avatar: string; rangoEdad: RangoEdad }>();
  async perfil(id: string) {
    return this.perfiles.get(id) ?? null;
  }
}

export class MaestriaFalsa implements ResolutorMaestria {
  readonly valores = new Map<string, Maestrias>();
  async maestriasDe(id: string) {
    return this.valores.get(id) ?? null;
  }
}

export class FichasFalsas implements FuenteFichasLectura {
  readonly lista: FichaLecturaPublicada[] = [];
  async fichas(ids: string[]) {
    return this.lista.filter((f) => ids.includes(f.id));
  }
  async publicadas(rango: RangoEdad) {
    return this.lista.filter((f) => f.rangoEdad === rango);
  }
}

export class AvanceFalso implements ResolutorAvanceLecturas {
  readonly estados = new Map<string, AvanceLectura>();
  async avanceDe(_id: string, ids: string[]) {
    return new Map([...this.estados].filter(([k]) => ids.includes(k)));
  }
}

export class LecturasFalsas implements ResolutorLecturasRealizadas {
  readonly lista: LecturaRealizada[] = [];
  async realizadasDe() {
    return this.lista;
  }
}

export class MundosFalsos implements ResolutorMundosCompletados {
  readonly lista: MundoCompletado[] = [];
  async completadosDe() {
    return this.lista;
  }
}

/** Ensambla los casos de uso con sus dobles; cada prueba crea su propio entorno limpio. */
export function crearEntornoGamificacion() {
  let secuencia = 0;
  const reloj = new Reloj(new Date('2026-10-21T15:00:00Z')); // miércoles 21, 10:00 en Lima
  const generarId = () => `id-${++secuencia}`;
  const repo = new GamificacionEnMemoria();
  const identidad = new IdentidadFalsa();
  const maestria = new MaestriaFalsa();
  const fichas = new FichasFalsas();
  const avance = new AvanceFalso();
  const lecturas = new LecturasFalsas();
  const mundos = new MundosFalsos();
  const bus = new BusEspia();
  const logros = new LogrosUseCase(repo, identidad, maestria, fichas, avance, bus, generarId, reloj.ahora);
  const pasaporte = new PasaporteUseCase(repo, identidad, lecturas, mundos, fichas, logros, bus, generarId, reloj.ahora);
  return { reloj, repo, identidad, maestria, fichas, avance, lecturas, mundos, bus, logros, pasaporte };
}

export type EntornoGamificacion = ReturnType<typeof crearEntornoGamificacion>;
