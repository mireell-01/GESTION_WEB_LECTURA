/**
 * Dobles de prueba de Progreso: repositorio en memoria con las mismas barreras que la base (versión
 * por habilidad, perfil creado una sola vez, un origen por habilidad en el historial) y las fuentes
 * del shared-kernel (diagnóstico, fichas, avance, misión en curso) simuladas.
 */
import type {
  AvanceLectura,
  FichaLecturaPublicada,
  FuenteFichasLectura,
  Habilidad,
  LecturaDeMision,
  RangoEdad,
  ResolutorAvanceLecturas,
  ResolutorDiagnosticoInicial,
  ResolutorMisionEnCurso,
  ResultadoDiagnosticoInicial,
} from '../../../src/modules/shared-kernel/public-api';
import type { AsignacionesEstudiante, IdentidadEstudiantes, PerfilRepository, RecomendacionRepository } from '../../../src/modules/progreso/application/ports/progreso.ports';
import { PerfilLectorUseCase } from '../../../src/modules/progreso/application/use-cases/perfil-lector.use-case';
import { RecomendacionesUseCase } from '../../../src/modules/progreso/application/use-cases/recomendaciones.use-case';
import { MaestriaDeHabilidad, OrigenCambio, PerfilLector } from '../../../src/modules/progreso/domain/entities/perfil-lector';
import { MaestriaDesactualizadaError } from '../../../src/modules/progreso/domain/errors/errores-progreso';
import { Recomendacion } from '../../../src/modules/progreso/domain/services/recomendador';
import { BusEspia, Reloj } from '../iam/dobles';

export class PerfilesEnMemoria implements PerfilRepository {
  readonly filas = new Map<string, MaestriaDeHabilidad[]>();
  readonly historial: { estudianteId: string; habilidad: Habilidad; anterior: number; nuevo: number; origen: OrigenCambio; origenId: string | null }[] = [];
  /** Para simular que otro pedido guardó justo antes. */
  conflictosPendientes = 0;

  async buscar(estudianteId: string) {
    const f = this.filas.get(estudianteId);
    return f ? PerfilLector.desdePersistencia(estudianteId, structuredClone(f)) : null;
  }

  /** Comprueba y escribe sin ceder el turno, como la transacción de la base. */
  async guardar(perfil: PerfilLector) {
    if (this.conflictosPendientes > 0) {
      this.conflictosPendientes -= 1;
      throw new MaestriaDesactualizadaError();
    }
    const guardadas = this.filas.get(perfil.estudianteId);
    const cambiadas = new Set(perfil.habilidadesCambiadas());
    if (!perfil.estaPersistido && guardadas) throw new MaestriaDesactualizadaError();
    if (perfil.estaPersistido) {
      for (const h of cambiadas) if (guardadas?.find((g) => g.habilidad === h)?.version !== perfil.de(h).version) throw new MaestriaDesactualizadaError();
    }
    for (const c of perfil.cambios()) {
      if (c.origenId && this.historial.some((x) => x.origen === c.origen && x.origenId === c.origenId && x.habilidad === c.habilidad)) throw new MaestriaDesactualizadaError();
    }
    this.filas.set(
      perfil.estudianteId,
      perfil.todas().map((m) => ({ ...m, version: m.version + (cambiadas.has(m.habilidad) ? 1 : 0) })),
    );
    for (const c of perfil.cambios()) this.historial.push({ estudianteId: perfil.estudianteId, habilidad: c.habilidad, anterior: c.anterior, nuevo: c.nuevo, origen: c.origen, origenId: c.origenId });
    perfil.confirmarCambios();
  }

  async yaAplicado(origen: OrigenCambio, origenId: string) {
    return this.historial.some((x) => x.origen === origen && x.origenId === origenId);
  }
}

export class RecomendacionesEnMemoria implements RecomendacionRepository {
  readonly guardadas: { estudianteId: string; vigente: boolean; prioridad: number; r: Recomendacion }[] = [];
  reemplazos = 0;

  async vigentes(estudianteId: string) {
    return this.guardadas.filter((g) => g.estudianteId === estudianteId && g.vigente).sort((a, b) => a.prioridad - b.prioridad).map((g) => g.r);
  }

  async reemplazar(estudianteId: string, recomendaciones: Recomendacion[]) {
    this.reemplazos += 1;
    for (const g of this.guardadas) if (g.estudianteId === estudianteId) g.vigente = false;
    recomendaciones.forEach((r, i) => this.guardadas.push({ estudianteId, vigente: true, prioridad: i + 1, r }));
  }
}

export class DiagnosticoFalso implements ResolutorDiagnosticoInicial {
  readonly resultados = new Map<string, ResultadoDiagnosticoInicial>();
  async resultadoDe(id: string) {
    return this.resultados.get(id) ?? { estado: 'PENDIENTE' as const };
  }
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly rangos = new Map<string, RangoEdad>();
  async rangoDe(id: string) {
    return this.rangos.get(id) ?? null;
  }
}

export class AsignacionesFalsas implements AsignacionesEstudiante {
  readonly lista: { estudianteId: string; asignacionId: string; tipo: 'LECTURA' | 'MISION'; contenidoId: string; titulo: string }[] = [];
  async vigentes(id: string) {
    return this.lista.filter((a) => a.estudianteId === id);
  }
}

export class FichasFalsas implements FuenteFichasLectura {
  readonly lista: FichaLecturaPublicada[] = [];
  publicar(id: string, p: { rangoEdad?: RangoEdad; nivelDificultad?: number; habilidades?: Habilidad[] } = {}) {
    this.lista.push({ id, titulo: `Lectura ${id}`, rangoEdad: p.rangoEdad ?? 'R2', nivelDificultad: p.nivelDificultad ?? 2, tematica: 'Animales', habilidadesObjetivo: p.habilidades ?? ['LIT'] });
  }
  async fichas(ids: string[]) {
    return this.lista.filter((f) => ids.includes(f.id));
  }
  async publicadas(rango: RangoEdad) {
    return this.lista.filter((f) => f.rangoEdad === rango);
  }
}

export class AvanceFalso implements ResolutorAvanceLecturas {
  readonly avance = new Map<string, Map<string, AvanceLectura>>();
  marcar(estudianteId: string, lecturaId: string, estado: AvanceLectura) {
    const suyo = this.avance.get(estudianteId) ?? new Map<string, AvanceLectura>();
    suyo.set(lecturaId, estado);
    this.avance.set(estudianteId, suyo);
  }
  async avanceDe(estudianteId: string, ids: string[]) {
    return new Map([...(this.avance.get(estudianteId) ?? new Map<string, AvanceLectura>())].filter(([id]) => ids.includes(id)));
  }
}

export class MisionFalsa implements ResolutorMisionEnCurso {
  readonly porEstudiante = new Map<string, LecturaDeMision>();
  async lecturaSiguiente(id: string) {
    return this.porEstudiante.get(id) ?? null;
  }
}

export function crearEntornoProgreso() {
  const reloj = new Reloj();
  const repo = new PerfilesEnMemoria();
  const recomendacionesRepo = new RecomendacionesEnMemoria();
  const diagnostico = new DiagnosticoFalso();
  const identidad = new IdentidadFalsa();
  const asignaciones = new AsignacionesFalsas();
  const fichas = new FichasFalsas();
  const avance = new AvanceFalso();
  const mision = new MisionFalsa();
  const bus = new BusEspia();
  const perfil = new PerfilLectorUseCase(repo, diagnostico, identidad, bus, reloj.ahora);
  return {
    reloj,
    repo,
    recomendacionesRepo,
    diagnostico,
    identidad,
    asignaciones,
    fichas,
    avance,
    mision,
    bus,
    perfil,
    recomendaciones: new RecomendacionesUseCase(recomendacionesRepo, perfil, identidad, asignaciones, fichas, avance, mision, reloj.ahora),
  };
}

export type EntornoProgreso = ReturnType<typeof crearEntornoProgreso>;
