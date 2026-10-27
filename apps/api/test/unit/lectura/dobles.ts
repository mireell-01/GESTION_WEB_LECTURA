/**
 * Dobles de prueba de Lectura: repositorio en memoria con la misma restricción única que la base
 * (una sesión sin terminar por estudiante y lectura), una lectura de ejemplo con todas las
 * modalidades (antes, durante con anclajes, después, defensa e historia ramificada) e IAM, Escuela y
 * Contenido simulados.
 */
import type { RangoEdad } from '../../../src/modules/shared-kernel/public-api';
import type { ContenidoLecturas, EscuelaLectura, IdentidadEstudiantes, SesionRepository } from '../../../src/modules/lectura/application/ports/lectura.ports';
import { HistorialUseCase } from '../../../src/modules/lectura/application/use-cases/historial.use-case';
import { RevisionUseCase } from '../../../src/modules/lectura/application/use-cases/revision.use-case';
import { SesionesUseCase } from '../../../src/modules/lectura/application/use-cases/sesiones.use-case';
import { EstadoRespuesta, SesionLectura } from '../../../src/modules/lectura/domain/entities/sesion-lectura';
import type { ActividadLectura, ContenidoLectura, ItemLectura, NodoLectura } from '../../../src/modules/lectura/domain/value-objects/contenido-lectura';
import { BusEspia, Reloj } from '../iam/dobles';

const copiar = (s: SesionLectura) => SesionLectura.desdePersistencia(structuredClone(s.propsSnapshot) as SesionLectura['propsSnapshot']);

export class SesionesEnMemoria implements SesionRepository {
  readonly filas = new Map<string, SesionLectura>();
  guardados = 0;

  async buscar(id: string) {
    const s = this.filas.get(id);
    return s ? copiar(s) : null;
  }
  async buscarPorRespuesta(respuestaId: string) {
    const s = [...this.filas.values()].find((x) => x.respuestas.some((r) => r.id === respuestaId));
    return s ? copiar(s) : null;
  }
  private activa(estudianteId: string, lecturaId: string) {
    return [...this.filas.values()].find((x) => x.estudianteId === estudianteId && x.lecturaId === lecturaId && (x.estado === 'INICIADA' || x.estado === 'EN_CURSO'));
  }
  async activaDe(estudianteId: string, lecturaId: string) {
    const s = this.activa(estudianteId, lecturaId);
    return s ? copiar(s) : null;
  }
  /** Comprobar y escribir sin ceder el turno, como el índice único parcial de la base. */
  async crear(s: SesionLectura) {
    if (this.activa(s.estudianteId, s.lecturaId)) return false;
    this.filas.set(s.id, copiar(s));
    return true;
  }
  async guardar(s: SesionLectura) {
    if (!this.filas.has(s.id)) throw new Error('No existe');
    this.guardados += 1;
    s.confirmarCambios();
    this.filas.set(s.id, copiar(s));
  }
  async tieneFinalizada(estudianteId: string, lecturaId: string) {
    return [...this.filas.values()].some((x) => x.estudianteId === estudianteId && x.lecturaId === lecturaId && x.estado === 'FINALIZADA');
  }
  async avanceDe(estudianteId: string, lecturaIds: string[], activaDesde: Date) {
    const avance = new Map<string, 'EN_CURSO' | 'FINALIZADA'>();
    for (const s of this.filas.values()) {
      if (s.estudianteId !== estudianteId || !lecturaIds.includes(s.lecturaId)) continue;
      if (s.estado === 'FINALIZADA') avance.set(s.lecturaId, 'FINALIZADA');
      else if ((s.estado === 'INICIADA' || s.estado === 'EN_CURSO') && s.ultimaActividadEn >= activaDesde && !avance.has(s.lecturaId)) avance.set(s.lecturaId, 'EN_CURSO');
    }
    return avance;
  }
  /** RF-064 (Módulo 9): las últimas sesiones del estudiante, de la más reciente a la más antigua. */
  async ultimasDe(estudianteId: string, limite: number) {
    return [...this.filas.values()]
      .filter((s) => s.estudianteId === estudianteId)
      .sort((a, b) => b.propsSnapshot.iniciadaEn.getTime() - a.propsSnapshot.iniciadaEn.getTime())
      .slice(0, limite)
      .map(copiar);
  }
  async conRespuestasAbiertas(estudianteIds: string[], estado: EstadoRespuesta) {
    return [...this.filas.values()].filter((s) => estudianteIds.includes(s.estudianteId) && s.respuestas.some((r) => r.estado === estado)).map(copiar);
  }
}

const item = (p: Partial<ItemLectura> & Pick<ItemLectura, 'id' | 'modalidad' | 'habilidad'>): ItemLectura => ({
  orden: 1,
  nivelDificultad: 2,
  esCerrado: p.modalidad === 'SELECCION' || p.modalidad === 'ORDENAMIENTO' || p.modalidad === 'EVIDENCIA',
  enunciado: `Pregunta ${p.id}`,
  opciones: [],
  indicesCorrectos: [],
  multiple: false,
  elementos: [],
  minPalabras: null,
  explicacionModelada: `Explicación de ${p.id}: vuelve al texto.`,
  pistas: [],
  clavesEvidencia: [],
  ...p,
});

const pistas = (n: number, id: string) => (['P1', 'P2', 'P3'] as const).slice(0, n).map((nivel) => ({ nivel, texto: `${nivel} de ${id}` }));

/** "Killa y la llama": 3 párrafos, 6 oraciones; o1–o2 · o3–o4 · o5–o6. */
export const ORACIONES = [
  { id: 'o1', orden: 1, parrafo: 1, texto: 'Killa vivía en Puno.' },
  { id: 'o2', orden: 2, parrafo: 1, texto: 'Cada mañana cuidaba a su llama Pancho.' },
  { id: 'o3', orden: 3, parrafo: 2, texto: 'Un día Pancho no quiso comer.' },
  { id: 'o4', orden: 4, parrafo: 2, texto: 'Killa vio que tenía una espina en la pata.' },
  { id: 'o5', orden: 5, parrafo: 3, texto: 'Con cuidado le quitó la espina.' },
  { id: 'o6', orden: 6, parrafo: 3, texto: 'Pancho comió feliz y Killa sonrió.' },
];

/**
 * La lectura de ejemplo. Orden del guion: predicción (escrita) → [antes] elegir → [durante, en o3]
 * selección con 3 pistas → [durante, en o4] evidencia → [después] ordenar → [después] escribir (ARG) →
 * [después] defender lo escrito eligiendo la mejor justificación.
 */
export function lecturaDeEjemplo(p: { lecturaId?: string; versionId?: string; rangoEdad?: RangoEdad; conHistoria?: boolean; prediccionConOpciones?: boolean } = {}): ContenidoLectura {
  const actividades: ActividadLectura[] = [
    {
      id: 'a-pred', momento: 'ANTES', tipo: 'PREDICCION', orden: 1, oracionAnclajeId: null,
      items: [p.prediccionConOpciones
        ? item({ id: 'it-pred', modalidad: 'SELECCION', habilidad: 'INF', enunciado: '¿Qué crees que le pasará a la llama?', opciones: ['Se enfermará', 'Viajará'], indicesCorrectos: [0], pistas: pistas(1, 'pred') })
        : item({ id: 'it-pred', modalidad: 'ESCRITURA', habilidad: 'INF', enunciado: '¿Qué crees que le pasará a la llama?' })],
    },
    { id: 'a-antes', momento: 'ANTES', tipo: 'SELECCION', orden: 2, oracionAnclajeId: null, items: [item({ id: 'it-antes', modalidad: 'SELECCION', habilidad: 'VOC', opciones: ['Un animal', 'Una planta'], indicesCorrectos: [0], pistas: pistas(1, 'antes') })] },
    // Durante, a propósito fuera de orden: el guion las ordena por la oración de anclaje.
    { id: 'a-evid', momento: 'DURANTE', tipo: 'EVIDENCIA', orden: 4, oracionAnclajeId: 'o4', items: [item({ id: 'it-evid', modalidad: 'EVIDENCIA', habilidad: 'LIT', clavesEvidencia: ['o3', 'o4'], pistas: pistas(1, 'evid') })] },
    { id: 'a-sel', momento: 'DURANTE', tipo: 'SELECCION', orden: 3, oracionAnclajeId: 'o3', items: [item({ id: 'it-sel', modalidad: 'SELECCION', habilidad: 'INF', nivelDificultad: 3, opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indicesCorrectos: [1], pistas: pistas(3, 'sel') })] },
    { id: 'a-ord', momento: 'DESPUES', tipo: 'ORDENAMIENTO', orden: 5, oracionAnclajeId: null, items: [item({ id: 'it-ord', modalidad: 'ORDENAMIENTO', habilidad: 'LIT', elementos: ['No quiso comer', 'Vio la espina', 'Le quitó la espina'], pistas: pistas(2, 'ord') })] },
    { id: 'a-esc', momento: 'DESPUES', tipo: 'ESCRITURA', orden: 6, oracionAnclajeId: null, items: [item({ id: 'it-esc', modalidad: 'ESCRITURA', habilidad: 'ARG', minPalabras: 3 })] },
    { id: 'a-def', momento: 'DESPUES', tipo: 'DEFIENDE', orden: 7, oracionAnclajeId: null, items: [item({ id: 'it-def', modalidad: 'SELECCION', habilidad: 'ARG', opciones: ['Porque lo dice el texto', 'Porque sí'], indicesCorrectos: [0], pistas: pistas(1, 'def') })] },
  ];
  const nodos: NodoLectura[] = p.conHistoria
    ? [
        { id: 'n-inicio', clave: 'inicio', contenido: 'Killa puede llevar a Pancho al río o al cerro.', esInicio: true, esFinal: false, opciones: [{ texto: 'Ir al río', destino: 'rio' }, { texto: 'Subir al cerro', destino: 'cerro' }] },
        { id: 'n-rio', clave: 'rio', contenido: 'En el río, Pancho bebió agua fresca.', esInicio: false, esFinal: true, opciones: [] },
        { id: 'n-cerro', clave: 'cerro', contenido: 'En el cerro vieron un cóndor.', esInicio: false, esFinal: false, opciones: [{ texto: 'Volver a casa', destino: 'casa' }] },
        { id: 'n-casa', clave: 'casa', contenido: 'Volvieron a casa al atardecer.', esInicio: false, esFinal: true, opciones: [] },
      ]
    : [];
  return {
    lecturaId: p.lecturaId ?? 'lectura-killa',
    versionId: p.versionId ?? 'version-killa-1',
    titulo: 'Killa y la llama',
    rangoEdad: p.rangoEdad ?? 'R2',
    nivelDificultad: 2,
    imagen: { url: '/api/v1/biblioteca/recursos/img', textoAlternativo: 'Una niña con su llama' },
    oraciones: ORACIONES,
    actividades,
    nodos,
  };
}

export class ContenidoFalso implements ContenidoLecturas {
  readonly versiones = new Map<string, ContenidoLectura>();
  readonly publicadas = new Map<string, string>();

  publicar(c: ContenidoLectura) {
    this.versiones.set(c.versionId, c);
    this.publicadas.set(c.lecturaId, c.versionId);
  }
  archivar(lecturaId: string) {
    this.publicadas.delete(lecturaId);
  }
  async publicada(lecturaId: string) {
    const id = this.publicadas.get(lecturaId);
    return id ? (this.versiones.get(id) ?? null) : null;
  }
  async version(versionId: string) {
    return this.versiones.get(versionId) ?? null;
  }
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly perfilesPorId = new Map<string, { id: string; alias: string; avatar: string; rangoEdad: RangoEdad; activo: boolean }>();
  agregar(id: string, alias: string, rangoEdad: RangoEdad, activo = true) {
    this.perfilesPorId.set(id, { id, alias, avatar: 'zorro', rangoEdad, activo });
  }
  async perfiles(ids: string[]) {
    return ids.map((id) => this.perfilesPorId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  }
}

/** Un aula por docente; `asignaciones`: lo que la docente dejó a cada niño (RF-018). */
export class EscuelaFalsa implements EscuelaLectura {
  readonly aulas = new Map<string, { docenteId: string; nombre: string; estudiantes: string[] }>();
  readonly asignaciones: { estudianteId: string; asignacionId: string; lecturaId: string }[] = [];

  async tieneDocente(estudianteId: string) {
    return [...this.aulas.values()].some((a) => a.estudiantes.includes(estudianteId));
  }
  async asignacionDeLectura(estudianteId: string, asignacionId: string, lecturaId: string) {
    return this.asignaciones.some((x) => x.estudianteId === estudianteId && x.asignacionId === asignacionId && x.lecturaId === lecturaId);
  }
  async aulaDelDocente(docenteId: string, aulaId: string) {
    const a = this.aulas.get(aulaId);
    return a && a.docenteId === docenteId ? { id: aulaId, nombre: a.nombre } : null;
  }
  async estudiantes(aulaId: string) {
    return this.aulas.get(aulaId)?.estudiantes ?? [];
  }
  async docenteAccedeAEstudiante(docenteId: string, estudianteId: string) {
    return [...this.aulas.values()].some((a) => a.docenteId === docenteId && a.estudiantes.includes(estudianteId));
  }
}

export function crearEntornoLectura() {
  let secuencia = 0;
  const reloj = new Reloj();
  const generarId = () => `id-${++secuencia}`;
  const repo = new SesionesEnMemoria();
  const contenido = new ContenidoFalso();
  const identidad = new IdentidadFalsa();
  const escuela = new EscuelaFalsa();
  const bus = new BusEspia();
  return {
    reloj,
    repo,
    contenido,
    identidad,
    escuela,
    bus,
    sesiones: new SesionesUseCase(repo, contenido, identidad, escuela, bus, generarId, reloj.ahora),
    revision: new RevisionUseCase(repo, contenido, identidad, escuela, bus, reloj.ahora),
    historial: new HistorialUseCase(repo, contenido),
  };
}

export type EntornoLectura = ReturnType<typeof crearEntornoLectura>;
