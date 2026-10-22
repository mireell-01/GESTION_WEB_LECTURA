import { RespuestaInvalidaError } from '../errors/errores-lectura';
import { ItemLectura } from '../value-objects/contenido-lectura';
import { filtrarPalabras, palabrasDe } from './filtro-palabras';

/** RF-041: tope de una respuesta escrita (o dictada, RF-049). */
export const MAX_CARACTERES_RESPUESTA = 500;

/** Lo que envía el niño; según la modalidad del ítem se usa un campo u otro. */
export interface EntradaRespuesta {
  indice?: number;
  indices?: number[];
  orden?: number[];
  oraciones?: string[];
  texto?: string;
  porVoz?: boolean;
}

/** Lo que se guarda de la respuesta: en el formato de cada modalidad, ya validado. */
export type ContenidoRespuesta =
  | { indice: number }
  | { indices: number[] }
  | { orden: number[] }
  | { oraciones: string[] }
  | { texto: string; porVoz: boolean };

export interface Correccion {
  contenido: ContenidoRespuesta;
  /** null en las abiertas: las valora la docente (RF-051). */
  esCorrecta: boolean | null;
  /** RF-041: se aplicó el filtro de palabras no apropiadas. */
  filtrado: boolean;
}

/** Semilla reproducible a partir de un texto (FNV-1a de 32 bits). */
function semilla(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * RF-042: el orden en que se le muestran los elementos (posiciones del orden correcto), mezclado de
 * forma estable por sesión e ítem, y nunca ya ordenado. El niño responde con las posiciones de esa
 * lista, así la pantalla no revela el orden correcto.
 */
export function ordenMostrado(n: number, clave: string): number[] {
  const orden = Array.from({ length: n }, (_, i) => i);
  let s = semilla(clave) || 1;
  const azar = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [orden[i], orden[j]] = [orden[j] as number, orden[i] as number];
  }
  if (n > 1 && orden.every((v, i) => v === i)) orden.push(orden.shift() as number);
  return orden;
}

/** RF-043: correcta si incluye al menos 1 oración de la clave y como mucho 1 ajena a ella. */
export function evidenciaCorrecta(seleccion: string[], clave: string[]): boolean {
  const enClave = seleccion.filter((id) => clave.includes(id)).length;
  return enClave >= 1 && seleccion.length - enClave <= 1;
}

const esEntero = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/**
 * Valida la respuesta según la modalidad del ítem y la corrige en el servidor (RF-040 a RF-043); en
 * las abiertas aplica el filtro de palabras (RF-041). La clave nunca sale de aquí.
 */
export function corregir(item: ItemLectura, entrada: EntradaRespuesta, ctx: { claveOrden: string; oracionesValidas: Set<string> }): Correccion {
  switch (item.modalidad) {
    case 'SELECCION': {
      const n = item.opciones.length;
      if (item.multiple) {
        const indices = [...new Set(entrada.indices ?? [])].sort((a, b) => a - b);
        if (indices.length === 0 || !indices.every((i) => esEntero(i, 0, n - 1))) throw new RespuestaInvalidaError('Elige una o más opciones');
        const correctos = [...item.indicesCorrectos].sort((a, b) => a - b);
        const esCorrecta = indices.length === correctos.length && indices.every((v, i) => v === correctos[i]);
        return { contenido: { indices }, esCorrecta: item.esCerrado ? esCorrecta : null, filtrado: false };
      }
      if (!esEntero(entrada.indice, 0, n - 1)) throw new RespuestaInvalidaError('Elige una de las opciones');
      return { contenido: { indice: entrada.indice }, esCorrecta: item.esCerrado ? item.indicesCorrectos.includes(entrada.indice) : null, filtrado: false };
    }
    case 'ORDENAMIENTO': {
      const n = item.elementos.length;
      const orden = entrada.orden ?? [];
      if (orden.length !== n || new Set(orden).size !== n || !orden.every((i) => esEntero(i, 0, n - 1))) {
        throw new RespuestaInvalidaError('Ordena todos los elementos');
      }
      const mostrado = ordenMostrado(n, ctx.claveOrden);
      return { contenido: { orden }, esCorrecta: orden.every((posicion, k) => mostrado[posicion] === k), filtrado: false };
    }
    case 'EVIDENCIA': {
      const oraciones = [...new Set(entrada.oraciones ?? [])];
      if (oraciones.length === 0) throw new RespuestaInvalidaError('Toca las oraciones del texto que respaldan tu respuesta');
      if (oraciones.some((id) => !ctx.oracionesValidas.has(id))) throw new RespuestaInvalidaError('Elige oraciones del texto que estás leyendo');
      return { contenido: { oraciones }, esCorrecta: evidenciaCorrecta(oraciones, item.clavesEvidencia), filtrado: false };
    }
    case 'ESCRITURA':
    case 'VOZ': {
      const texto = String(entrada.texto ?? '').trim();
      if (texto.length === 0) throw new RespuestaInvalidaError(item.modalidad === 'VOZ' ? 'Di o escribe tu respuesta' : 'Escribe tu respuesta');
      if (texto.length > MAX_CARACTERES_RESPUESTA) throw new RespuestaInvalidaError(`Tu respuesta puede tener hasta ${MAX_CARACTERES_RESPUESTA} letras`);
      if (item.minPalabras && palabrasDe(texto) < item.minPalabras) {
        throw new RespuestaInvalidaError(`Escribe un poco más: al menos ${item.minPalabras} ${item.minPalabras === 1 ? 'palabra' : 'palabras'}`);
      }
      const filtro = filtrarPalabras(texto);
      // RF-049: solo llega el texto que el niño confirmó; el audio nunca sale de su dispositivo.
      return { contenido: { texto: filtro.texto, porVoz: entrada.porVoz === true }, esCorrecta: null, filtrado: filtro.filtrado };
    }
  }
}
