import { NoEncontradoError } from '../../../shared-kernel/public-api';
import {
  LecturaIncompletaError,
  PasoFueraDeOrdenError,
  RespuestaInvalidaError,
  SinPistasError,
  TransicionSesionError,
  ValoracionInvalidaError,
} from '../errors/errores-lectura';
import { ContenidoRespuesta, corregir, EntradaRespuesta, MAX_CARACTERES_RESPUESTA } from '../services/correccion';
import { filtrarPalabras, palabrasDe } from '../services/filtro-palabras';
import { Fase, Guion, Paso } from '../services/guion';
import { NIVELES_PISTA, puntajeDeRubrica, puntajeItem } from '../services/politica-pistas';
import { ItemLectura, Modalidad, NodoLectura, OracionLectura } from '../value-objects/contenido-lectura';

export type EstadoSesion = 'INICIADA' | 'EN_CURSO' | 'FINALIZADA' | 'ABANDONADA';
/** SRS §3.6, respuesta abierta: ENVIADA → PENDIENTE_REVISION → VALORADA. Las cerradas quedan ENVIADA. */
export type EstadoRespuesta = 'ENVIADA' | 'PENDIENTE_REVISION' | 'VALORADA';
export type NivelUso = 'P1' | 'P2' | 'P3' | 'EXPLICACION';

/** SRS §3.6: una sesión sin actividad durante 7 días queda ABANDONADA. */
export const DIAS_PARA_ABANDONO = 7;
const MS_ABANDONO = DIAS_PARA_ABANDONO * 24 * 60 * 60 * 1000;
export const MAX_CARACTERES_COMENTARIO = 300;

export interface Justificacion {
  modalidad: 'ESCRITURA' | 'SELECCION';
  texto: string | null;
  opcionElegida: { indices: number[]; texto: string } | null;
  creadaEn: Date;
}

export interface Valoracion {
  docenteId: string;
  nivel: number;
  comentario: string | null;
  valoradaEn: Date;
}

/** Lo que el niño hizo en un ítem durante esta sesión: una respuesta por ítem por intento (SRS §7). */
export interface RespuestaItem {
  id: string;
  itemId: string;
  habilidad: string;
  modalidad: Modalidad;
  /** Vacío mientras solo pidió pistas. */
  contenido: ContenidoRespuesta | Record<string, never>;
  esCorrecta: boolean | null;
  pistasUsadas: number;
  puntajeItem: number | null;
  estado: EstadoRespuesta;
  /** RF-046: clave del último envío; repetir el mismo envío devuelve el mismo resultado. */
  idempotencyKey: string;
  respondidaEn: Date;
  usos: { nivel: NivelUso; usadaEn: Date }[];
  /** RF-044: la defensa de esta respuesta ("Defiende tu respuesta"). */
  justificacion: Justificacion | null;
  valoracion: Valoracion | null;
}

export interface DecisionRuta {
  id: string;
  nodoOrigenId: string;
  nodoDestinoId: string;
  decididaEn: Date;
}

export interface PropsSesion {
  id: string;
  estudianteId: string;
  lecturaId: string;
  versionLecturaId: string;
  asignacionId: string | null;
  estado: EstadoSesion;
  prediccion: string | null;
  reflexion: string | null;
  itemActualId: string | null;
  esRepeticion: boolean;
  iniciadaEn: Date;
  ultimaActividadEn: Date;
  finalizadaEn: Date | null;
  respuestas: RespuestaItem[];
  decisiones: DecisionRuta[];
}

export type ResultadoCorreccion = 'CORRECTA' | 'INCORRECTA' | 'ENVIADA';

export interface PistaEntregada {
  nivel: 'P1' | 'P2' | 'P3';
  texto: string;
  /** RN-06: el párrafo que se resalta, si corresponde. */
  parrafo: number | null;
}

export interface ResultadoRespuesta {
  respuesta: RespuestaItem;
  resultado: ResultadoCorreccion;
  pista: PistaEntregada | null;
  /** RF-045: tras agotar las pistas, la explicación modelada que remite al texto. */
  explicacion: string | null;
  /** La pregunta quedó cerrada (acertó, agotó las pistas o envió su respuesta abierta). */
  resuelta: boolean;
  filtrado: boolean;
  /** Era un reenvío del mismo pedido (RF-046): no se volvió a corregir. */
  repetido: boolean;
}

export interface ResumenSesion {
  preguntas: number;
  sinAyuda: number;
  conPista: number;
  conExplicacion: number;
  abiertas: number;
}

const esEntero = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function textoLibre(valor: unknown, vacio: string): { texto: string; filtrado: boolean } {
  const texto = String(valor ?? '').trim();
  if (texto.length === 0) throw new RespuestaInvalidaError(vacio);
  if (texto.length > MAX_CARACTERES_RESPUESTA) throw new RespuestaInvalidaError(`Puedes escribir hasta ${MAX_CARACTERES_RESPUESTA} letras`);
  return filtrarPalabras(texto);
}

/** Una respuesta cerró su ítem: acertó, se le mostró la explicación o envió su respuesta abierta. */
export function estaResuelta(r: RespuestaItem | undefined, item: ItemLectura): boolean {
  if (!r) return false;
  if (!item.esCerrado) return 'texto' in r.contenido;
  return r.esCorrecta === true || r.usos.some((u) => u.nivel === 'EXPLICACION');
}

/**
 * Agregado: SesionLectura (RF-038 a RF-051). Un intento de un estudiante sobre una versión publicada.
 * El avance lo manda el guion: no se ve el texto sin predecir (RF-038), no se pasa de una pregunta sin
 * responderla o agotar sus pistas (RF-039, RF-045) y el cierre exige todo lo anterior (RF-047). Cada
 * cambio se guarda al momento, así la sesión se reanuda donde quedó (RF-046).
 */
export class SesionLectura {
  private readonly sucias = new Set<string>();
  private decisionesNuevas: DecisionRuta[] = [];

  private constructor(private props: PropsSesion) {}

  static iniciar(p: { id: string; estudianteId: string; lecturaId: string; versionLecturaId: string; asignacionId: string | null; esRepeticion: boolean; ahora: Date }): SesionLectura {
    return new SesionLectura({
      ...p,
      estado: 'INICIADA',
      prediccion: null,
      reflexion: null,
      itemActualId: null,
      iniciadaEn: p.ahora,
      ultimaActividadEn: p.ahora,
      finalizadaEn: null,
      respuestas: [],
      decisiones: [],
    });
  }

  static desdePersistencia(props: PropsSesion): SesionLectura {
    return new SesionLectura({
      ...props,
      respuestas: props.respuestas.map((r) => ({ ...r, usos: [...r.usos] })),
      decisiones: [...props.decisiones],
    });
  }

  get id() { return this.props.id; }
  get estudianteId() { return this.props.estudianteId; }
  get lecturaId() { return this.props.lecturaId; }
  get versionLecturaId() { return this.props.versionLecturaId; }
  get asignacionId() { return this.props.asignacionId; }
  get estado() { return this.props.estado; }
  get prediccion() { return this.props.prediccion; }
  get reflexion() { return this.props.reflexion; }
  get esRepeticion() { return this.props.esRepeticion; }
  get ultimaActividadEn() { return this.props.ultimaActividadEn; }
  get finalizadaEn() { return this.props.finalizadaEn; }
  get decisiones(): readonly DecisionRuta[] { return this.props.decisiones; }
  get respuestas(): readonly RespuestaItem[] { return this.props.respuestas; }

  get propsSnapshot(): Readonly<PropsSesion> {
    return this.props;
  }

  /** Para el repositorio: lo que cambió desde que se cargó. */
  cambios(): { respuestas: RespuestaItem[]; decisiones: DecisionRuta[] } {
    return { respuestas: this.props.respuestas.filter((r) => this.sucias.has(r.itemId)), decisiones: [...this.decisionesNuevas] };
  }

  confirmarCambios(): void {
    this.sucias.clear();
    this.decisionesNuevas = [];
  }

  respuestaDe(itemId: string): RespuestaItem | undefined {
    return this.props.respuestas.find((r) => r.itemId === itemId);
  }

  // ── Dónde está ─────────────────────────────────────────────────────────

  fase(g: Guion): Fase | 'FINALIZADA' | 'ABANDONADA' {
    if (this.props.estado === 'FINALIZADA' || this.props.estado === 'ABANDONADA') return this.props.estado;
    if (this.props.estado === 'INICIADA') return 'PREDICCION';
    const pendiente = this.pasoPendiente(g);
    if (pendiente && pendiente.fase !== 'DESPUES') return pendiente.fase;
    if (g.esRamificada && !this.nodoActual(g)?.esFinal) return 'HISTORIA';
    return pendiente ? 'DESPUES' : 'CIERRE';
  }

  /** La pregunta que el niño tiene en pantalla (ninguna al predecir, en la historia o en el cierre). */
  pasoEnPantalla(g: Guion): Paso | null {
    const fase = this.fase(g);
    return fase === 'ANTES' || fase === 'LECTURA' || fase === 'DESPUES' ? (this.pasoPendiente(g) ?? null) : null;
  }

  /** RF-038, RF-039: sin texto antes de predecir y en lo "antes"; durante, hasta la oración de anclaje. */
  oracionesVisibles(g: Guion): OracionLectura[] {
    const fase = this.fase(g);
    if (fase === 'PREDICCION' || fase === 'ANTES') return [];
    if (fase === 'LECTURA') return g.oracionesHasta(this.pasoEnPantalla(g)?.hastaOracion ?? null);
    return g.oracionesHasta(null);
  }

  /** RF-048: el nodo de la historia donde está (el inicio, o adonde lo llevó su última decisión). */
  nodoActual(g: Guion): NodoLectura | null {
    if (!g.esRamificada) return null;
    const ultima = this.props.decisiones.at(-1);
    return (ultima ? g.nodo(ultima.nodoDestinoId) : g.nodoInicial()) ?? null;
  }

  pendientes(g: Guion): number {
    const pasos = g.pasos.filter((p) => !estaResuelta(this.respuestaDe(p.item.id), p.item)).length;
    return pasos + (g.esRamificada && !this.nodoActual(g)?.esFinal ? 1 : 0);
  }

  resumen(g: Guion): ResumenSesion {
    const r: ResumenSesion = { preguntas: g.pasos.length, sinAyuda: 0, conPista: 0, conExplicacion: 0, abiertas: 0 };
    for (const p of g.pasos) {
      const resp = this.respuestaDe(p.item.id);
      if (!p.item.esCerrado) r.abiertas += 1;
      else if (resp?.usos.some((u) => u.nivel === 'EXPLICACION')) r.conExplicacion += 1;
      else if (resp?.esCorrecta && resp.pistasUsadas > 0) r.conPista += 1;
      else if (resp?.esCorrecta) r.sinAyuda += 1;
    }
    return r;
  }

  // ── Lo que hace el niño ────────────────────────────────────────────────

  /** RF-038: registra la predicción (texto, o la opción elegida) y recién entonces abre la lectura. */
  predecir(g: Guion, entrada: { texto?: string; indice?: number }, ahora: Date): { filtrado: boolean } {
    if (this.props.estado !== 'INICIADA') {
      this.asegurarActiva();
      throw new TransicionSesionError('Ya contaste qué crees que pasará');
    }
    let resultado: { texto: string; filtrado: boolean };
    if (g.prediccion.opciones.length > 0) {
      if (!esEntero(entrada.indice, 0, g.prediccion.opciones.length - 1)) throw new RespuestaInvalidaError('Elige lo que crees que pasará');
      resultado = { texto: g.prediccion.opciones[entrada.indice] as string, filtrado: false };
    } else {
      resultado = textoLibre(entrada.texto, 'Cuenta qué crees que pasará');
    }
    this.props.prediccion = resultado.texto;
    this.props.estado = 'EN_CURSO';
    this.tocar(g, ahora);
    return { filtrado: resultado.filtrado };
  }

  /** RF-040 a RF-045: corrige en el servidor; si no acierta, la pista siguiente o, al final, la explicación. */
  responder(g: Guion, p: { itemId: string; entrada: EntradaRespuesta; idempotencyKey: string; ahora: Date; generarId: () => string }): ResultadoRespuesta {
    const existente = this.respuestaDe(p.itemId);
    if (existente && existente.idempotencyKey === p.idempotencyKey) {
      return { respuesta: existente, ...this.resultadoDe(g, existente), resuelta: this.resuelta(g, existente), filtrado: false, repetido: true };
    }
    const paso = this.pasoParaActuar(g, p.itemId);
    const correccion = corregir(paso.item, p.entrada, {
      claveOrden: `${this.id}:${paso.item.id}`,
      oracionesValidas: new Set(this.oracionesVisibles(g).map((o) => o.id)),
    });

    const r = existente ?? this.nuevaRespuesta(paso.item, p.generarId(), p.idempotencyKey, p.ahora);
    r.contenido = correccion.contenido;
    r.esCorrecta = correccion.esCorrecta;
    r.idempotencyKey = p.idempotencyKey;
    r.respondidaEn = p.ahora;
    if (paso.item.esCerrado && correccion.esCorrecta) {
      r.puntajeItem = puntajeItem(r.pistasUsadas, false);
    } else if (paso.item.esCerrado) {
      if (r.pistasUsadas < paso.item.pistas.length) {
        r.pistasUsadas += 1;
        r.usos.push({ nivel: NIVELES_PISTA[r.pistasUsadas - 1] as NivelUso, usadaEn: p.ahora });
      } else {
        r.usos.push({ nivel: 'EXPLICACION', usadaEn: p.ahora });
        r.puntajeItem = puntajeItem(r.pistasUsadas, true);
      }
    }
    const resuelta = estaResuelta(r, paso.item);
    if (resuelta && paso.defiende) this.justificar(paso, correccion.contenido, p.ahora);
    this.marcar(r);
    this.tocar(g, p.ahora);
    return { respuesta: r, ...this.resultadoDe(g, r), resuelta, filtrado: correccion.filtrado, repetido: false };
  }

  /** RF-045: el niño pide ayuda; recibe la pista siguiente (cuenta para el puntaje del ítem, RN-07). */
  pedirPista(g: Guion, p: { itemId: string; ahora: Date; generarId: () => string }): PistaEntregada {
    const paso = this.pasoParaActuar(g, p.itemId);
    const r = this.respuestaDe(paso.item.id) ?? this.nuevaRespuesta(paso.item, p.generarId(), p.generarId(), p.ahora);
    if (r.pistasUsadas >= paso.item.pistas.length) throw new SinPistasError();
    r.pistasUsadas += 1;
    const nivel = NIVELES_PISTA[r.pistasUsadas - 1] as PistaEntregada['nivel'];
    r.usos.push({ nivel, usadaEn: p.ahora });
    this.marcar(r);
    this.tocar(g, p.ahora);
    return this.pistaVista(g, paso, nivel);
  }

  /** RF-048: la decisión en la historia ramificada se registra y lleva al nodo siguiente. */
  decidir(g: Guion, p: { nodoId: string; opcion: number; ahora: Date; generarId: () => string }): NodoLectura {
    this.asegurarEnCurso();
    if (this.fase(g) !== 'HISTORIA') throw new PasoFueraDeOrdenError('Todavía no es momento de elegir el camino');
    const actual = this.nodoActual(g);
    if (!actual || actual.id !== p.nodoId) throw new PasoFueraDeOrdenError('Elige en la parte de la historia que estás leyendo');
    const opcion = esEntero(p.opcion, 0, actual.opciones.length - 1) ? actual.opciones[p.opcion] : undefined;
    if (!opcion) throw new RespuestaInvalidaError('Elige uno de los caminos');
    const destino = g.nodoPorClave(opcion.destino);
    if (!destino) throw new Error(`La historia no tiene el nodo "${opcion.destino}"`);
    const decision = { id: p.generarId(), nodoOrigenId: actual.id, nodoDestinoId: destino.id, decididaEn: p.ahora };
    this.props.decisiones.push(decision);
    this.decisionesNuevas.push(decision);
    this.tocar(g, p.ahora);
    return destino;
  }

  /**
   * RF-047: el cierre contrasta su predicción con el desenlace y pide una reflexión. Las respuestas
   * abiertas pasan a revisión si tiene docente (RF-051); sin docente quedan enviadas (RN-19).
   */
  finalizar(g: Guion, p: { reflexion: string; ahora: Date; conDocente: boolean }): { filtrado: boolean } {
    this.asegurarEnCurso();
    if (this.fase(g) !== 'CIERRE') throw new LecturaIncompletaError(this.pendientes(g));
    const reflexion = textoLibre(p.reflexion, 'Cuéntanos qué piensas de lo que pasó');
    this.props.reflexion = reflexion.texto;
    this.props.estado = 'FINALIZADA';
    this.props.finalizadaEn = p.ahora;
    this.props.ultimaActividadEn = p.ahora;
    this.props.itemActualId = null;
    if (p.conDocente) {
      for (const paso of g.pasos) {
        const r = this.respuestaDe(paso.item.id);
        if (!paso.item.esCerrado && r && r.estado === 'ENVIADA' && 'texto' in r.contenido) {
          r.estado = 'PENDIENTE_REVISION';
          this.marcar(r);
        }
      }
    }
    return { filtrado: reflexion.filtrado };
  }

  /** SRS §3.6: tras 7 días sin actividad la sesión queda ABANDONADA (y se puede empezar otra). */
  abandonarSiInactiva(ahora: Date): boolean {
    if (this.props.estado !== 'INICIADA' && this.props.estado !== 'EN_CURSO') return false;
    if (ahora.getTime() - this.props.ultimaActividadEn.getTime() < MS_ABANDONO) return false;
    this.props.estado = 'ABANDONADA';
    this.props.itemActualId = null;
    return true;
  }

  // ── Lo que hace la docente ─────────────────────────────────────────────

  /** RF-051: valora una respuesta abierta con la rúbrica de 3 niveles. */
  valorar(p: { respuestaId: string; docenteId: string; nivel: number; comentario?: string | null; ahora: Date }): RespuestaItem {
    const r = this.props.respuestas.find((x) => x.id === p.respuestaId);
    if (!r) throw new NoEncontradoError('Respuesta');
    if (r.estado === 'VALORADA') throw new ValoracionInvalidaError('Esta respuesta ya fue valorada');
    if (r.estado !== 'PENDIENTE_REVISION') throw new ValoracionInvalidaError('Esta respuesta aún no espera revisión');
    if (!esEntero(p.nivel, 1, 3)) throw new RespuestaInvalidaError('Elige un nivel de la rúbrica, del 1 al 3');
    const comentario = String(p.comentario ?? '').trim();
    if (comentario.length > MAX_CARACTERES_COMENTARIO) throw new RespuestaInvalidaError(`El comentario puede tener hasta ${MAX_CARACTERES_COMENTARIO} caracteres`);
    r.valoracion = { docenteId: p.docenteId, nivel: p.nivel, comentario: comentario || null, valoradaEn: p.ahora };
    r.estado = 'VALORADA';
    r.puntajeItem = puntajeDeRubrica(p.nivel);
    this.marcar(r);
    return r;
  }

  // ── Detalles ───────────────────────────────────────────────────────────

  resultadoDe(g: Guion, r: RespuestaItem): Pick<ResultadoRespuesta, 'resultado' | 'pista' | 'explicacion'> {
    const paso = g.paso(r.itemId);
    if (!paso || !paso.item.esCerrado) return { resultado: 'ENVIADA', pista: null, explicacion: null };
    if (r.esCorrecta) return { resultado: 'CORRECTA', pista: null, explicacion: null };
    if (r.usos.some((u) => u.nivel === 'EXPLICACION')) return { resultado: 'INCORRECTA', pista: null, explicacion: paso.item.explicacionModelada };
    const nivel = NIVELES_PISTA[r.pistasUsadas - 1];
    return { resultado: 'INCORRECTA', pista: nivel ? this.pistaVista(g, paso, nivel) : null, explicacion: null };
  }

  /** Las pistas que ya recibió en esa pregunta (para mostrarlas al reanudar). */
  pistasRecibidas(g: Guion, paso: Paso): PistaEntregada[] {
    const r = this.respuestaDe(paso.item.id);
    return NIVELES_PISTA.slice(0, r?.pistasUsadas ?? 0).map((n) => this.pistaVista(g, paso, n));
  }

  private pistaVista(g: Guion, paso: Paso, nivel: PistaEntregada['nivel']): PistaEntregada {
    const texto = paso.item.pistas.find((x) => x.nivel === nivel)?.texto ?? '';
    return { nivel, texto, parrafo: g.parrafoDePista(paso, nivel) };
  }

  private resuelta(g: Guion, r: RespuestaItem): boolean {
    const paso = g.paso(r.itemId);
    return !!paso && estaResuelta(r, paso.item);
  }

  /** RF-039: solo se actúa sobre la pregunta en pantalla. */
  private pasoParaActuar(g: Guion, itemId: string): Paso {
    this.asegurarEnCurso();
    const paso = g.paso(itemId);
    if (!paso) throw new PasoFueraDeOrdenError('Esa pregunta no es parte de esta lectura');
    if (estaResuelta(this.respuestaDe(itemId), paso.item)) throw new PasoFueraDeOrdenError('Ya respondiste esta pregunta');
    if (this.pasoEnPantalla(g)?.item.id !== itemId) throw new PasoFueraDeOrdenError();
    return paso;
  }

  private pasoPendiente(g: Guion): Paso | undefined {
    return g.pasos.find((p) => !estaResuelta(this.respuestaDe(p.item.id), p.item));
  }

  /** RF-044: la defensa queda asociada a la respuesta original; no se omite (es un paso más del guion). */
  private justificar(paso: Paso, contenido: ContenidoRespuesta, ahora: Date): void {
    const original = paso.defiende ? this.respuestaDe(paso.defiende.id) : undefined;
    if (!original || original.justificacion) return;
    let justificacion: Justificacion | null = null;
    if ('texto' in contenido) justificacion = { modalidad: 'ESCRITURA', texto: contenido.texto, opcionElegida: null, creadaEn: ahora };
    const indices = 'indice' in contenido ? [contenido.indice] : 'indices' in contenido ? contenido.indices : null;
    if (indices) {
      const texto = indices.map((i) => paso.item.opciones[i]).join(' · ');
      justificacion = { modalidad: 'SELECCION', texto: null, opcionElegida: { indices, texto }, creadaEn: ahora };
    }
    if (!justificacion) return;
    original.justificacion = justificacion;
    this.marcar(original);
  }

  private nuevaRespuesta(item: ItemLectura, id: string, idempotencyKey: string, ahora: Date): RespuestaItem {
    const r: RespuestaItem = {
      id,
      itemId: item.id,
      habilidad: item.habilidad,
      modalidad: item.modalidad,
      contenido: {},
      esCorrecta: null,
      pistasUsadas: 0,
      puntajeItem: null,
      estado: 'ENVIADA',
      idempotencyKey,
      respondidaEn: ahora,
      usos: [],
      justificacion: null,
      valoracion: null,
    };
    this.props.respuestas.push(r);
    return r;
  }

  private marcar(r: RespuestaItem): void {
    this.sucias.add(r.itemId);
  }

  private tocar(g: Guion, ahora: Date): void {
    this.props.ultimaActividadEn = ahora;
    this.props.itemActualId = this.pasoEnPantalla(g)?.item.id ?? null;
  }

  private asegurarActiva(): void {
    if (this.props.estado === 'FINALIZADA') throw new TransicionSesionError('Esta lectura ya terminó');
    if (this.props.estado === 'ABANDONADA') throw new TransicionSesionError('Esta lectura se cerró por falta de actividad: empiézala de nuevo');
  }

  private asegurarEnCurso(): void {
    this.asegurarActiva();
    if (this.props.estado === 'INICIADA') throw new TransicionSesionError('Primero cuenta qué crees que pasará');
  }
}

/** RN-19: palabras de una respuesta abierta (para los puntos de esfuerzo). */
export function palabrasDeRespuesta(r: RespuestaItem): number | null {
  return 'texto' in r.contenido ? palabrasDe(r.contenido.texto) : null;
}
