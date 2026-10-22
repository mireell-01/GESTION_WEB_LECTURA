import { ActividadLectura, ContenidoLectura, ItemLectura, NodoLectura, OracionLectura } from '../value-objects/contenido-lectura';

/** Por dónde va la sesión: predecir → antes → leer (con preguntas) → historia → después → cierre. */
export type Fase = 'PREDICCION' | 'ANTES' | 'LECTURA' | 'HISTORIA' | 'DESPUES' | 'CIERRE';

export interface Paso {
  numero: number;
  item: ItemLectura;
  actividad: ActividadLectura;
  fase: 'ANTES' | 'LECTURA' | 'DESPUES';
  /** LECTURA: el texto se muestra hasta esta oración (la de anclaje, RF-039). */
  hastaOracion: number | null;
  /** DEFIENDE (RF-044): la pregunta anterior cuya respuesta se justifica. */
  defiende: ItemLectura | null;
}

export interface Prediccion {
  /** El ítem de predicción que escribió el autor; sin él, se usa la consigna general (RF-038). */
  itemId: string | null;
  enunciado: string;
  /** Si la predicción es eligiendo entre opciones. */
  opciones: string[];
}

export const CONSIGNA_PREDICCION = 'Mira el título y la imagen. ¿De qué crees que tratará esta lectura?';
export const PREGUNTA_REFLEXION = '¿Se parece lo que pensaste al principio a lo que pasó? ¿Qué te sorprendió?';

/**
 * El guion de una lectura: el orden en que el niño hace sus actividades y cuánto texto ve en cada
 * momento. Lo "antes" va sin el texto (primero la predicción, RF-038); lo "durante" sigue el orden de
 * las oraciones de anclaje y el texto avanza hasta cada una (RF-039); lo "después" va con el texto
 * completo y, si la historia es ramificada, tras llegar a un final (RF-048).
 */
export class Guion {
  readonly prediccion: Prediccion;
  readonly pasos: Paso[];
  private readonly ordenDe: Map<string, OracionLectura>;

  constructor(readonly contenido: ContenidoLectura) {
    this.ordenDe = new Map(contenido.oraciones.map((o) => [o.id, o]));
    const actividades = [...contenido.actividades].sort((a, b) => a.orden - b.orden);
    const primeraPrediccion = actividades.find((a) => a.tipo === 'PREDICCION' && a.items.length > 0);
    const itemPrediccion = primeraPrediccion ? [...primeraPrediccion.items].sort((a, b) => a.orden - b.orden)[0] : undefined;
    this.prediccion = itemPrediccion
      ? { itemId: itemPrediccion.id, enunciado: itemPrediccion.enunciado, opciones: itemPrediccion.modalidad === 'SELECCION' ? itemPrediccion.opciones : [] }
      : { itemId: null, enunciado: CONSIGNA_PREDICCION, opciones: [] };

    const anclaje = (a: ActividadLectura) => (a.oracionAnclajeId ? (this.ordenDe.get(a.oracionAnclajeId)?.orden ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER);
    const antes = actividades.filter((a) => a.momento === 'ANTES');
    const durante = actividades.filter((a) => a.momento === 'DURANTE').sort((a, b) => anclaje(a) - anclaje(b) || a.orden - b.orden);
    const despues = actividades.filter((a) => a.momento === 'DESPUES');

    const pasos: Paso[] = [];
    let defendible: ItemLectura | null = null;
    const agregar = (a: ActividadLectura, fase: Paso['fase']) => {
      for (const item of [...a.items].sort((x, y) => x.orden - y.orden)) {
        if (item.id === this.prediccion.itemId) continue;
        const esDefensa = a.tipo === 'DEFIENDE';
        pasos.push({
          numero: pasos.length + 1,
          item,
          actividad: a,
          fase,
          hastaOracion: fase === 'LECTURA' ? anclaje(a) : null,
          defiende: esDefensa ? defendible : null,
        });
        if (!esDefensa) defendible = item;
      }
    };
    antes.forEach((a) => agregar(a, 'ANTES'));
    durante.forEach((a) => agregar(a, 'LECTURA'));
    despues.forEach((a) => agregar(a, 'DESPUES'));
    this.pasos = pasos;
  }

  get esRamificada(): boolean {
    return this.contenido.nodos.length > 0;
  }

  paso(itemId: string): Paso | undefined {
    return this.pasos.find((p) => p.item.id === itemId);
  }

  oracion(id: string): OracionLectura | undefined {
    return this.ordenDe.get(id);
  }

  /** Las oraciones visibles hasta un orden dado (todas con `null`). */
  oracionesHasta(orden: number | null): OracionLectura[] {
    const todas = [...this.contenido.oraciones].sort((a, b) => a.orden - b.orden);
    return orden === null ? todas : todas.filter((o) => o.orden <= orden);
  }

  nodoInicial(): NodoLectura | undefined {
    return this.contenido.nodos.find((n) => n.esInicio);
  }

  nodo(id: string): NodoLectura | undefined {
    return this.contenido.nodos.find((n) => n.id === id);
  }

  nodoPorClave(clave: string): NodoLectura | undefined {
    return this.contenido.nodos.find((n) => n.clave === clave);
  }

  /** RF-045, RN-06: el párrafo que se resalta con la pista (la evidencia siempre; las demás desde P2). */
  parrafoDePista(paso: Paso, nivel: string): number | null {
    if (paso.item.modalidad === 'EVIDENCIA') {
      const clave = paso.item.clavesEvidencia.map((id) => this.ordenDe.get(id)).find((o) => o !== undefined);
      return clave?.parrafo ?? null;
    }
    if (nivel === 'P1' || !paso.actividad.oracionAnclajeId) return null;
    return this.ordenDe.get(paso.actividad.oracionAnclajeId)?.parrafo ?? null;
  }

  /** RF-047: el desenlace con que se contrasta la predicción (el final elegido, o el último párrafo). */
  desenlace(nodoFinalId: string | null): string {
    const final = nodoFinalId ? this.nodo(nodoFinalId) : undefined;
    if (final) return final.contenido;
    const oraciones = this.oracionesHasta(null);
    const ultimo = oraciones.at(-1)?.parrafo;
    return oraciones
      .filter((o) => o.parrafo === ultimo)
      .map((o) => o.texto)
      .join(' ');
  }
}
