/**
 * Dobles de prueba de Aventura: repositorio en memoria que se comporta como la base (copias, avance
 * de mundo condicional, orden único por mundo y edad) y registros simulados de lo que aportarán
 * Contenido y los Módulos 5, 6 y 7 (fichas, diagnóstico, maestría y avance de lectura).
 */
import type {
  AvanceLectura,
  FichaLecturaPublicada,
  FuenteFichasLectura,
  Maestrias,
  RangoEdad,
  ResolutorAvanceLecturas,
  ResolutorDiagnosticoInicial,
  ResolutorMaestria,
  ResultadoDiagnosticoInicial,
} from '../../../src/modules/shared-kernel/public-api';
import { uuidV7 } from '../../../src/modules/shared-kernel/infrastructure/uuid';
import type { AventuraRepository, MundoCatalogo } from '../../../src/modules/aventura/application/ports/aventura.repository';
import type { IdentidadEstudiantes } from '../../../src/modules/aventura/application/ports/identidad-estudiantes';
import { Posicionamiento } from '../../../src/modules/aventura/application/services/posicionamiento';
import { MapaUseCase } from '../../../src/modules/aventura/application/use-cases/mapa.use-case';
import { MisionesBackofficeUseCase } from '../../../src/modules/aventura/application/use-cases/misiones-backoffice.use-case';
import { ProgresoUseCase } from '../../../src/modules/aventura/application/use-cases/progreso.use-case';
import { Mision } from '../../../src/modules/aventura/domain/entities/mision';
import { EstadoDeMundo, ProgresoAventura } from '../../../src/modules/aventura/domain/entities/progreso-aventura';
import type { EstadoMision } from '../../../src/modules/aventura/domain/services/politica-progresion';
import { BusEspia, Reloj } from '../iam/dobles';

/** Los 5 mundos del SRS, como los carga la migración. */
export const MUNDOS: MundoCatalogo[] = [
  { id: 'mundo-1', numero: 1, nombre: 'Explorador', descripcion: 'Literal y vocabulario', habilidadesFoco: ['LIT', 'VOC'] },
  { id: 'mundo-2', numero: 2, nombre: 'Detective', descripcion: 'Inferencias', habilidadesFoco: ['INF', 'VOC'] },
  { id: 'mundo-3', numero: 3, nombre: 'Investigador', descripcion: 'Literal e inferencial', habilidadesFoco: ['LIT', 'INF'] },
  { id: 'mundo-4', numero: 4, nombre: 'Crítico', descripcion: 'Crítica y argumentación', habilidadesFoco: ['CRI', 'ARG'] },
  { id: 'mundo-5', numero: 5, nombre: 'Maestro de la Lectura', descripcion: 'Las cinco', habilidadesFoco: ['LIT', 'INF', 'VOC', 'CRI', 'ARG'] },
];

const copiarMision = (m: Mision) =>
  Mision.desdePersistencia({ id: m.id, mundoId: m.mundoId, rangoEdad: m.rangoEdad, orden: m.orden, datos: { titulo: m.titulo, descripcion: m.descripcion, lecturaIds: m.lecturaIds } });

export class AventuraEnMemoria implements AventuraRepository {
  readonly progresos = new Map<string, EstadoDeMundo[]>();
  readonly misionesGuardadas = new Map<string, Mision>();
  readonly estados = new Map<string, EstadoMision>();
  /** Simula que otro evento simultáneo ya completó el mundo. */
  otroEventoGanaElAvance = false;

  async mundos() { return MUNDOS.map((m) => ({ ...m, habilidadesFoco: [...m.habilidadesFoco] })); }

  async progreso(estudianteId: string) {
    const filas = this.progresos.get(estudianteId);
    return filas ? ProgresoAventura.desdePersistencia(estudianteId, filas.map((f) => ({ ...f }))) : null;
  }
  async crearProgreso(p: ProgresoAventura) {
    if (this.progresos.has(p.estudianteId)) return false;
    this.progresos.set(p.estudianteId, p.mundos);
    return true;
  }
  async avanzarMundo(estudianteId: string, completado: { mundoId: string; completadoEn: Date }, desbloqueado: { mundoId: string; desbloqueadoEn: Date } | null) {
    const filas = this.progresos.get(estudianteId) ?? [];
    const actual = filas.find((f) => f.mundoId === completado.mundoId);
    if (this.otroEventoGanaElAvance || actual?.estado !== 'DISPONIBLE') return false;
    actual.estado = 'COMPLETADO';
    actual.completadoEn = completado.completadoEn;
    const siguiente = filas.find((f) => f.mundoId === desbloqueado?.mundoId);
    if (desbloqueado && siguiente) {
      siguiente.estado = 'DISPONIBLE';
      siguiente.desbloqueadoEn = desbloqueado.desbloqueadoEn;
    }
    ProgresoAventura.desdePersistencia(estudianteId, filas.map((f) => ({ ...f }))); // como el CHECK de la base
    return true;
  }
  async marcarCelebrado(estudianteId: string, mundoId: string, ahora: Date) {
    const f = this.progresos.get(estudianteId)?.find((x) => x.mundoId === mundoId);
    if (f && f.desbloqueadoEn && !f.celebradoEn) f.celebradoEn = ahora;
  }

  async misiones(mundoId: string, rangoEdad: RangoEdad) {
    return [...this.misionesGuardadas.values()]
      .filter((m) => m.mundoId === mundoId && m.rangoEdad === rangoEdad)
      .sort((a, b) => a.orden - b.orden)
      .map(copiarMision);
  }
  async mision(id: string) {
    const m = this.misionesGuardadas.get(id);
    return m ? copiarMision(m) : null;
  }
  async misionesConLectura(lecturaId: string, rangoEdad: RangoEdad) {
    return [...this.misionesGuardadas.values()].filter((m) => m.rangoEdad === rangoEdad && m.lecturaIds.includes(lecturaId)).map(copiarMision);
  }
  async contarMisiones(rangoEdad: RangoEdad) {
    const conteo = new Map<string, number>();
    for (const m of this.misionesGuardadas.values()) if (m.rangoEdad === rangoEdad) conteo.set(m.mundoId, (conteo.get(m.mundoId) ?? 0) + 1);
    return conteo;
  }
  async guardarMision(m: Mision) {
    this.misionesGuardadas.set(m.id, copiarMision(m));
    this.verificarOrdenUnico();
  }
  async reordenar(misiones: Mision[]) {
    for (const m of misiones) this.misionesGuardadas.set(m.id, copiarMision(m));
    this.verificarOrdenUnico();
  }
  async estadosMision(estudianteId: string, misionIds: string[]) {
    return new Map(misionIds.filter((id) => this.estados.has(`${estudianteId}|${id}`)).map((id) => [id, this.estados.get(`${estudianteId}|${id}`) as EstadoMision]));
  }
  async guardarEstadoMision(estudianteId: string, misionId: string, estado: EstadoMision) {
    this.estados.set(`${estudianteId}|${misionId}`, estado);
  }
  async completadasPorMundo(estudianteId: string, rangoEdad: RangoEdad) {
    const conteo = new Map<string, number>();
    for (const [clave, estado] of this.estados) {
      const [est, misionId] = clave.split('|');
      const m = this.misionesGuardadas.get(misionId as string);
      if (est === estudianteId && estado === 'COMPLETADA' && m?.rangoEdad === rangoEdad) conteo.set(m.mundoId, (conteo.get(m.mundoId) ?? 0) + 1);
    }
    return conteo;
  }

  /** Como la restricción única (mundo, edad, orden) de la base. */
  private verificarOrdenUnico() {
    const claves = [...this.misionesGuardadas.values()].map((m) => `${m.mundoId}|${m.rangoEdad}|${m.orden}`);
    if (new Set(claves).size !== claves.length) throw new Error('mision_mundo_id_rango_edad_orden_key');
  }
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly rangos = new Map<string, RangoEdad | null>();
  async rangoEdad(estudianteId: string) { return this.rangos.get(estudianteId) ?? null; }
}

export class DiagnosticoFalso implements ResolutorDiagnosticoInicial {
  readonly resultados = new Map<string, ResultadoDiagnosticoInicial>();
  async resultadoDe(estudianteId: string): Promise<ResultadoDiagnosticoInicial> {
    return this.resultados.get(estudianteId) ?? { estado: 'SIN_MODULO' };
  }
}

export class MaestriaFalsa implements ResolutorMaestria {
  readonly valores = new Map<string, Maestrias>();
  async maestriasDe(estudianteId: string) { return this.valores.get(estudianteId) ?? null; }
}

export class AvanceFalso implements ResolutorAvanceLecturas {
  readonly avance = new Map<string, Map<string, AvanceLectura>>();
  marcar(estudianteId: string, lecturaId: string, estado: AvanceLectura) {
    const m = this.avance.get(estudianteId) ?? new Map<string, AvanceLectura>();
    m.set(lecturaId, estado);
    this.avance.set(estudianteId, m);
  }
  async avanceDe(estudianteId: string, lecturaIds: string[]) {
    const m = this.avance.get(estudianteId) ?? new Map<string, AvanceLectura>();
    return new Map(lecturaIds.filter((id) => m.has(id)).map((id) => [id, m.get(id) as AvanceLectura]));
  }
}

export class FichasFalsas implements FuenteFichasLectura {
  readonly publicadasPorId = new Map<string, FichaLecturaPublicada>();
  publicar(titulo: string, rangoEdad: RangoEdad = 'R2', nivelDificultad = 2): string {
    const id = uuidV7();
    this.publicadasPorId.set(id, { id, titulo, rangoEdad, nivelDificultad, tematica: 'Animales' });
    return id;
  }
  archivar(id: string) { this.publicadasPorId.delete(id); }
  async fichas(ids: string[]) { return ids.map((id) => this.publicadasPorId.get(id)).filter((f) => f !== undefined); }
  async publicadas(rangoEdad: RangoEdad) {
    return [...this.publicadasPorId.values()].filter((f) => f.rangoEdad === rangoEdad).sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  }
}

/** Ensambla los dobles y los casos de uso reales; cada prueba crea su propio entorno. */
export function crearEntornoAventura() {
  const reloj = new Reloj();
  const bus = new BusEspia();
  const repo = new AventuraEnMemoria();
  const identidad = new IdentidadFalsa();
  const diagnostico = new DiagnosticoFalso();
  const maestria = new MaestriaFalsa();
  const avance = new AvanceFalso();
  const fichas = new FichasFalsas();
  const posicionamiento = new Posicionamiento(repo, diagnostico, bus, reloj.ahora);
  return {
    reloj, bus, repo, identidad, diagnostico, maestria, avance, fichas,
    mapa: new MapaUseCase(repo, identidad, posicionamiento, maestria, avance, fichas, reloj.ahora),
    progreso: new ProgresoUseCase(repo, identidad, posicionamiento, maestria, avance, fichas, bus, reloj.ahora),
    misiones: new MisionesBackofficeUseCase(repo, fichas, bus, () => uuidV7(), reloj.ahora),
  };
}

export type EntornoAventura = ReturnType<typeof crearEntornoAventura>;
