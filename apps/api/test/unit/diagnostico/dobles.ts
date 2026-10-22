/**
 * Dobles de prueba del Diagnóstico: repositorio en memoria con las mismas restricciones únicas que
 * la base (un reto sin terminar por estudiante; único por estudiante, tipo y secuencia), un banco
 * con la estructura del real (una pregunta por habilidad en cada lectura, dificultad creciente) e
 * IAM y Escuela simulados.
 */
import type { RangoEdad } from '../../../src/modules/shared-kernel/public-api';
import { uuidV7 } from '../../../src/modules/shared-kernel/infrastructure/uuid';
import type { AulasDocente, BancoItems, DiagnosticoRepository, IdentidadEstudiantes } from '../../../src/modules/diagnostico/application/ports/diagnostico.ports';
import { ReevaluacionesUseCase } from '../../../src/modules/diagnostico/application/use-cases/reevaluaciones.use-case';
import { RetoUseCase } from '../../../src/modules/diagnostico/application/use-cases/reto.use-case';
import { Diagnostico } from '../../../src/modules/diagnostico/domain/entities/diagnostico';
import type { ItemDiagnostico } from '../../../src/modules/diagnostico/domain/entities/item-diagnostico';
import { Forma, ITEMS_POR_RANGO, ORDEN_HABILIDADES, TipoDiagnostico } from '../../../src/modules/diagnostico/domain/value-objects/plan-diagnostico';
import { BusEspia, Reloj } from '../iam/dobles';

const copiar = (d: Diagnostico) => Diagnostico.desdePersistencia(structuredClone(d.snapshot) as Diagnostico['snapshot']);

export class DiagnosticosEnMemoria implements DiagnosticoRepository {
  readonly filas = new Map<string, Diagnostico>();

  async buscar(id: string) {
    const d = this.filas.get(id);
    return d ? copiar(d) : null;
  }
  async crear(d: Diagnostico) {
    const todos = [...this.filas.values()];
    const repetido = todos.some((x) => x.estudianteId === d.estudianteId && x.tipo === d.tipo && x.secuencia === d.secuencia);
    const otroPendiente = d.estado !== 'FINALIZADO' && todos.some((x) => x.estudianteId === d.estudianteId && x.estado !== 'FINALIZADO');
    if (repetido || otroPendiente) return false;
    this.filas.set(d.id, copiar(d));
    return true;
  }
  async guardar(d: Diagnostico) {
    if (!this.filas.has(d.id)) throw new Error('No existe');
    this.filas.set(d.id, copiar(d));
  }
  async pendienteDe(estudianteId: string) {
    const d = [...this.filas.values()].find((x) => x.estudianteId === estudianteId && x.estado !== 'FINALIZADO');
    return d ? copiar(d) : null;
  }
  async inicialDe(estudianteId: string) {
    const d = [...this.filas.values()].find((x) => x.estudianteId === estudianteId && x.tipo === 'INICIAL');
    return d ? copiar(d) : null;
  }
  async ultimaSecuencia(estudianteId: string, tipo: TipoDiagnostico) {
    return Math.max(0, ...[...this.filas.values()].filter((x) => x.estudianteId === estudianteId && x.tipo === tipo).map((x) => x.secuencia));
  }
  async deEstudiantes(ids: string[]) {
    return [...this.filas.values()].filter((x) => ids.includes(x.estudianteId)).map(copiar);
  }
}

/**
 * Banco con la forma del real: lecturas de 5 preguntas (LIT, VOC, INF, CRI, ARG); la dificultad de
 * cada habilidad sube de una lectura a la siguiente (1, 2, 3 …). La opción correcta es la 1.
 */
export class BancoFalso implements BancoItems {
  pedidos = 0;
  async items(rangoEdad: RangoEdad, forma: Forma) {
    this.pedidos += 1;
    return generarBanco(rangoEdad, forma);
  }
}

const BANCO = new Map<string, ItemDiagnostico[]>();
export function generarBanco(rangoEdad: RangoEdad, forma: Forma): ItemDiagnostico[] {
  const clave = `${rangoEdad}|${forma}`;
  if (!BANCO.has(clave)) {
    BANCO.set(
      clave,
      Array.from({ length: ITEMS_POR_RANGO[rangoEdad] }, (_, i) => ({
        id: uuidV7(),
        rangoEdad,
        forma,
        orden: i + 1,
        habilidad: ORDEN_HABILIDADES[i % 5] as ItemDiagnostico['habilidad'],
        nivelDificultad: Math.floor(i / 5) + 1,
        enunciado: `Pregunta ${i + 1} (${forma})`,
        lectura: { clave: `${rangoEdad}-${forma}-${Math.floor(i / 5) + 1}`, titulo: `Lectura ${Math.floor(i / 5) + 1}`, texto: 'Había una vez…' },
        opciones: ['Primera', 'Correcta', 'Tercera'],
        indiceCorrecto: 1,
      })),
    );
  }
  return BANCO.get(clave) as ItemDiagnostico[];
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly perfilesPorId = new Map<string, { id: string; alias: string; avatar: string; rangoEdad: RangoEdad; activo: boolean }>();
  agregar(id: string, alias: string, rangoEdad: RangoEdad = 'R2', activo = true) {
    this.perfilesPorId.set(id, { id, alias, avatar: 'zorro', rangoEdad, activo });
  }
  async perfiles(ids: string[]) {
    return ids.map((id) => this.perfilesPorId.get(id)).filter((p) => p !== undefined);
  }
}

export class AulasFalsas implements AulasDocente {
  readonly aulas = new Map<string, { id: string; nombre: string; activa: boolean; docenteId: string; estudiantes: string[] }>();
  async aulaDelDocente(docenteId: string, aulaId: string) {
    const a = this.aulas.get(aulaId);
    return a && a.docenteId === docenteId ? { id: a.id, nombre: a.nombre, activa: a.activa } : null;
  }
  async estudiantes(aulaId: string) {
    return [...(this.aulas.get(aulaId)?.estudiantes ?? [])];
  }
}

/** Ensambla los dobles y los casos de uso reales; cada prueba crea su propio entorno. */
export function crearEntornoDiagnostico() {
  const reloj = new Reloj();
  const bus = new BusEspia();
  const repo = new DiagnosticosEnMemoria();
  const banco = new BancoFalso();
  const identidad = new IdentidadFalsa();
  const aulas = new AulasFalsas();
  return {
    reloj, bus, repo, banco, identidad, aulas,
    reto: new RetoUseCase(repo, banco, identidad, bus, () => uuidV7(), reloj.ahora),
    reevaluaciones: new ReevaluacionesUseCase(repo, aulas, identidad, bus, () => uuidV7(), reloj.ahora),
  };
}

export type EntornoDiagnostico = ReturnType<typeof crearEntornoDiagnostico>;
