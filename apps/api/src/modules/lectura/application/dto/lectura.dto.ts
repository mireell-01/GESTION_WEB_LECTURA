import { estaResuelta, PistaEntregada, RespuestaItem, ResultadoCorreccion, ResumenSesion, SesionLectura } from '../../domain/entities/sesion-lectura';
import { MAX_CARACTERES_RESPUESTA, ordenMostrado } from '../../domain/services/correccion';
import { Fase, Guion, Paso, PREGUNTA_REFLEXION } from '../../domain/services/guion';
import { ItemLectura, Modalidad, OracionLectura } from '../../domain/value-objects/contenido-lectura';

/** La pregunta en pantalla, sin su clave (RF-040: la corrección es solo en el servidor). */
export interface PreguntaVista {
  itemId: string;
  numero: number;
  total: number;
  momento: string;
  tipo: string;
  modalidad: Modalidad;
  habilidad: string;
  enunciado: string;
  opciones: string[];
  multiple: boolean;
  /** RF-042: los elementos mezclados; el niño responde con sus posiciones en esta lista. */
  elementos: string[];
  minPalabras: number | null;
  maxCaracteres: number;
  /** RF-039: la oración tras la cual aparece la pregunta. */
  anclajeOracionId: string | null;
  /** RF-045: las pistas que ya recibió y cuántas le quedan. */
  pistas: PistaEntregada[];
  pistasRestantes: number;
  /** RF-044: la pregunta y la respuesta que ahora defiende. */
  defiende: { enunciado: string; respuesta: string } | null;
}

export interface SesionVista {
  id: string;
  lecturaId: string;
  estado: string;
  fase: Fase | 'FINALIZADA' | 'ABANDONADA';
  lectura: { titulo: string; rangoEdad: string; imagen: { url: string; textoAlternativo: string } | null; leerEnVozAlta: boolean };
  prediccion: { enunciado: string; opciones: string[]; respuesta: string | null };
  /** Solo lo que ya puede leer (RF-038, RF-039). */
  texto: { parrafos: { numero: number; oraciones: { id: string; texto: string }[] }[]; completo: boolean };
  progreso: { hechas: number; total: number };
  pregunta: PreguntaVista | null;
  historia: { nodo: { id: string; contenido: string; esFinal: boolean; opciones: string[] }; recorrido: { contenido: string; eleccion: string }[] } | null;
  cierre: { prediccion: string; desenlace: string; pregunta: string } | null;
  reflexion: string | null;
  resumen: ResumenSesion | null;
}

export interface RespuestaVista {
  respuestaId: string;
  resultado: ResultadoCorreccion;
  pista: PistaEntregada | null;
  explicacion: string | null;
  filtrado: boolean;
  sesion: SesionVista;
}

/** RF-051: una respuesta abierta para la revisión docente. */
export interface RespuestaAbiertaVista {
  respuestaId: string;
  estado: string;
  estudiante: { id: string; alias: string; avatar: string };
  lectura: { id: string; titulo: string };
  pregunta: { enunciado: string; habilidad: string };
  respuesta: string;
  porVoz: boolean;
  /** Si es una defensa (RF-044): la pregunta y la respuesta que defiende. */
  defiende: { enunciado: string; respuesta: string } | null;
  /** RF-044: cómo defendió después esta respuesta. */
  justificacion: string | null;
  respondidaEn: string;
  valoracion: { nivel: number; comentario: string | null } | null;
}

function parrafos(oraciones: OracionLectura[]): SesionVista['texto']['parrafos'] {
  const porParrafo = new Map<number, { id: string; texto: string }[]>();
  for (const o of oraciones) porParrafo.set(o.parrafo, [...(porParrafo.get(o.parrafo) ?? []), { id: o.id, texto: o.texto }]);
  return [...porParrafo.entries()].map(([numero, lista]) => ({ numero, oraciones: lista }));
}

/** Lo que respondió el niño, en palabras (para "Defiende tu respuesta" y la revisión docente). */
export function respuestaEnTexto(g: Guion, sesionId: string, item: ItemLectura, r: RespuestaItem | undefined): string {
  const c = r?.contenido;
  if (!c) return '';
  if ('texto' in c) return c.texto;
  if ('indice' in c) return item.opciones[c.indice] ?? '';
  if ('indices' in c) return c.indices.map((i) => item.opciones[i]).join(' · ');
  if ('orden' in c) {
    const mostrado = ordenMostrado(item.elementos.length, `${sesionId}:${item.id}`);
    return c.orden.map((posicion) => item.elementos[mostrado[posicion] as number]).join(' → ');
  }
  if ('oraciones' in c) return c.oraciones.map((id) => g.oracion(id)?.texto ?? '').join(' ');
  return '';
}

function vistaPregunta(s: SesionLectura, g: Guion, paso: Paso): PreguntaVista {
  const it = paso.item;
  const r = s.respuestaDe(it.id);
  const mostrado = it.modalidad === 'ORDENAMIENTO' ? ordenMostrado(it.elementos.length, `${s.id}:${it.id}`) : [];
  return {
    itemId: it.id,
    numero: paso.numero,
    total: g.pasos.length,
    momento: paso.actividad.momento,
    tipo: paso.actividad.tipo,
    modalidad: it.modalidad,
    habilidad: it.habilidad,
    enunciado: it.enunciado,
    opciones: it.modalidad === 'SELECCION' ? it.opciones : [],
    multiple: it.modalidad === 'SELECCION' && it.multiple,
    elementos: mostrado.map((k) => it.elementos[k] as string),
    minPalabras: it.minPalabras,
    maxCaracteres: MAX_CARACTERES_RESPUESTA,
    anclajeOracionId: paso.fase === 'LECTURA' ? paso.actividad.oracionAnclajeId : null,
    pistas: s.pistasRecibidas(g, paso),
    pistasRestantes: Math.max(0, it.pistas.length - (r?.pistasUsadas ?? 0)),
    defiende: paso.defiende ? { enunciado: paso.defiende.enunciado, respuesta: respuestaEnTexto(g, s.id, paso.defiende, s.respuestaDe(paso.defiende.id)) } : null,
  };
}

function vistaHistoria(s: SesionLectura, g: Guion): SesionVista['historia'] {
  const nodo = s.nodoActual(g);
  if (!nodo) return null;
  const recorrido = s.decisiones.map((d) => {
    const origen = g.nodo(d.nodoOrigenId);
    const destino = g.nodo(d.nodoDestinoId);
    return { contenido: origen?.contenido ?? '', eleccion: origen?.opciones.find((o) => o.destino === destino?.clave)?.texto ?? '' };
  });
  return { nodo: { id: nodo.id, contenido: nodo.contenido, esFinal: nodo.esFinal, opciones: nodo.opciones.map((o) => o.texto) }, recorrido };
}

export function vistaSesion(s: SesionLectura, g: Guion): SesionVista {
  const fase = s.fase(g);
  const paso = s.pasoEnPantalla(g);
  const visibles = s.oracionesVisibles(g);
  const c = g.contenido;
  const enCierre = fase === 'CIERRE' || fase === 'FINALIZADA';
  const historiaVisible = g.esRamificada && (fase === 'HISTORIA' || fase === 'DESPUES' || enCierre);
  const ultimoNodo = historiaVisible ? s.nodoActual(g) : null;
  return {
    id: s.id,
    lecturaId: s.lecturaId,
    estado: s.estado,
    fase,
    lectura: { titulo: c.titulo, rangoEdad: c.rangoEdad, imagen: c.imagen, leerEnVozAlta: c.rangoEdad === 'R1' },
    prediccion: { enunciado: g.prediccion.enunciado, opciones: g.prediccion.opciones, respuesta: s.prediccion },
    texto: { parrafos: parrafos(visibles), completo: visibles.length === c.oraciones.length },
    progreso: { hechas: g.pasos.filter((p) => estaResuelta(s.respuestaDe(p.item.id), p.item)).length, total: g.pasos.length },
    pregunta: paso ? vistaPregunta(s, g, paso) : null,
    historia: historiaVisible ? vistaHistoria(s, g) : null,
    cierre: enCierre ? { prediccion: s.prediccion ?? '', desenlace: g.desenlace(ultimoNodo?.esFinal ? ultimoNodo.id : null), pregunta: PREGUNTA_REFLEXION } : null,
    reflexion: s.reflexion,
    resumen: fase === 'FINALIZADA' ? s.resumen(g) : null,
  };
}

export function vistaRespuestaAbierta(
  s: SesionLectura,
  g: Guion,
  r: RespuestaItem,
  estudiante: { id: string; alias: string; avatar: string },
): RespuestaAbiertaVista {
  const paso = g.paso(r.itemId) as Paso;
  return {
    respuestaId: r.id,
    estado: r.estado,
    estudiante,
    lectura: { id: s.lecturaId, titulo: g.contenido.titulo },
    pregunta: { enunciado: paso.item.enunciado, habilidad: paso.item.habilidad },
    respuesta: 'texto' in r.contenido ? r.contenido.texto : '',
    porVoz: 'porVoz' in r.contenido ? r.contenido.porVoz : false,
    defiende: paso.defiende
      ? { enunciado: paso.defiende.enunciado, respuesta: respuestaEnTexto(g, s.id, paso.defiende, s.respuestaDe(paso.defiende.id)) }
      : null,
    justificacion: r.justificacion ? (r.justificacion.texto ?? r.justificacion.opcionElegida?.texto ?? null) : null,
    respondidaEn: r.respondidaEn.toISOString(),
    valoracion: r.valoracion ? { nivel: r.valoracion.nivel, comentario: r.valoracion.comentario } : null,
  };
}
