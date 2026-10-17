import { DatoLecturaInvalidoError } from '../errors/errores-contenido';

/** Oración con identificador estable dentro de su versión (RF-022). */
export interface Oracion {
  id: string;
  orden: number;
  parrafo: number;
  texto: string;
}

/** `contenido.oracion.orden` admite de 1 a 400 oraciones por versión. */
export const MAX_ORACIONES = 400;
export const MAX_CARACTERES_TEXTO = 20_000;

const TERMINALES = '.!?…';
const CIERRES = '"\'»”’)]';
const INICIO_ORACION = /[A-ZÁÉÍÓÚÑÜ0-9¿¡"«“—–\-(]/;
/** Abreviaturas frecuentes en textos escolares que no terminan una oración. */
const ABREVIATURAS = new Set(['sr', 'sra', 'srta', 'dr', 'dra', 'lic', 'prof', 'profa', 'ing', 'av', 'ud', 'uds', 'etc', 'pág', 'núm', 'n', 'st', 'sto', 'sta', 'aprox', 'ej']);

/**
 * Normaliza el texto en párrafos: cada línea con contenido es un párrafo (así los versos de un
 * poema quedan separados) y los espacios repetidos se reducen a uno.
 */
export function parrafosDe(texto: string): string[] {
  return texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

/** Corta un párrafo en oraciones: tras . ! ? … (con sus cierres) seguidos de espacio e inicio de oración. */
export function partirParrafo(parrafo: string): string[] {
  const oraciones: string[] = [];
  let desde = 0;
  for (let i = 0; i < parrafo.length; i++) {
    if (!TERMINALES.includes(parrafo[i] as string)) continue;
    let fin = i + 1;
    while (fin < parrafo.length && (TERMINALES + CIERRES).includes(parrafo[fin] as string)) fin++;
    if (parrafo[fin] !== ' ') continue;
    const siguiente = parrafo[fin + 1] ?? '';
    if (!INICIO_ORACION.test(siguiente)) continue;
    if (parrafo[i] === '.') {
      const palabra = /([\p{L}]+)$/u.exec(parrafo.slice(desde, i))?.[1] ?? '';
      // "Sr. Pérez", "J. R. Ribeyro": la abreviatura o la inicial no cierran la oración.
      if (ABREVIATURAS.has(palabra.toLowerCase()) || (palabra.length === 1 && palabra === palabra.toUpperCase())) continue;
    }
    oraciones.push(parrafo.slice(desde, fin).trim());
    desde = fin + 1;
    i = fin;
  }
  const resto = parrafo.slice(desde).trim();
  if (resto) oraciones.push(resto);
  return oraciones;
}

/** Texto de la versión reconstruido desde sus oraciones: párrafos separados por una línea en blanco. */
export function textoDe(oraciones: Oracion[]): string {
  const parrafos = new Map<number, string[]>();
  for (const o of [...oraciones].sort((a, b) => a.orden - b.orden)) {
    parrafos.set(o.parrafo, [...(parrafos.get(o.parrafo) ?? []), o.texto]);
  }
  return [...parrafos.values()].map((p) => p.join(' ')).join('\n\n');
}

function numerar(oraciones: Omit<Oracion, 'orden'>[]): Oracion[] {
  if (oraciones.length > MAX_ORACIONES) {
    throw new DatoLecturaInvalidoError(`Una lectura puede tener hasta ${MAX_ORACIONES} oraciones`);
  }
  return oraciones.map((o, i) => ({ ...o, orden: i + 1 }));
}

/**
 * Segmenta el texto en oraciones (RF-022) conservando lo que ya existía: una oración anterior que
 * sigue igual en el texto mantiene su id (y con él sus anclajes y evidencias), y los cortes que el
 * editor ajustó a mano se respetan mientras el texto de esas oraciones no cambie.
 */
export function segmentar(texto: string, anteriores: Oracion[], generarId: () => string): Oracion[] {
  if (texto.length > MAX_CARACTERES_TEXTO) {
    throw new DatoLecturaInvalidoError(`El texto admite hasta ${MAX_CARACTERES_TEXTO.toLocaleString('es-PE')} caracteres`);
  }
  const libres = [...anteriores].sort((a, b) => a.orden - b.orden);
  const tomar = (o: Oracion) => libres.splice(libres.indexOf(o), 1);
  const alComienzo = (resto: string, o: Oracion) =>
    resto.startsWith(o.texto) && (resto.length === o.texto.length || resto[o.texto.length] === ' ');

  const resultado: Omit<Oracion, 'orden'>[] = [];
  parrafosDe(texto).forEach((parrafo, p) => {
    let resto = parrafo;
    while (resto) {
      // ¿Empieza aquí una oración que ya existía? Se conserva tal cual (la más larga gana).
      const previa = libres.filter((o) => alComienzo(resto, o)).sort((a, b) => b.texto.length - a.texto.length)[0];
      if (previa) {
        tomar(previa);
        resultado.push({ id: previa.id, parrafo: p + 1, texto: previa.texto });
        resto = resto.slice(previa.texto.length).trim();
        continue;
      }
      // Si no, la primera oración automática; se corta antes si ahí empieza una oración que ya existía.
      let corte = partirParrafo(resto)[0] as string;
      for (const o of libres) {
        const donde = resto.indexOf(` ${o.texto}`);
        if (donde > 0 && donde < corte.length && alComienzo(resto.slice(donde + 1), o)) corte = resto.slice(0, donde);
      }
      resultado.push({ id: generarId(), parrafo: p + 1, texto: corte.trim() });
      resto = resto.slice(corte.length).trim();
    }
  });
  return numerar(resultado);
}

/** RF-022: el editor une una oración con la siguiente del mismo párrafo. Devuelve también qué id desapareció. */
export function unirConSiguiente(oraciones: Oracion[], id: string): { oraciones: Oracion[]; absorbida: string } {
  const lista = [...oraciones].sort((a, b) => a.orden - b.orden);
  const i = lista.findIndex((o) => o.id === id);
  const actual = lista[i];
  const siguiente = lista[i + 1];
  if (!actual) throw new DatoLecturaInvalidoError('Esa oración no está en esta lectura');
  if (!siguiente || siguiente.parrafo !== actual.parrafo) {
    throw new DatoLecturaInvalidoError('Solo se une con la oración siguiente del mismo párrafo');
  }
  lista.splice(i, 2, { ...actual, texto: `${actual.texto} ${siguiente.texto}` });
  return { oraciones: numerar(lista), absorbida: siguiente.id };
}

/** RF-022: el editor corta una oración en un espacio; la primera parte conserva el id. */
export function dividir(oraciones: Oracion[], id: string, posicion: number, generarId: () => string): Oracion[] {
  const lista = [...oraciones].sort((a, b) => a.orden - b.orden);
  const i = lista.findIndex((o) => o.id === id);
  const actual = lista[i];
  if (!actual) throw new DatoLecturaInvalidoError('Esa oración no está en esta lectura');
  const primera = actual.texto.slice(0, posicion).trim();
  const segunda = actual.texto.slice(posicion).trim();
  if (!primera || !segunda || (actual.texto[posicion] !== ' ' && actual.texto[posicion - 1] !== ' ')) {
    throw new DatoLecturaInvalidoError('Corta la oración entre dos palabras');
  }
  lista.splice(i, 1, { ...actual, texto: primera }, { id: generarId(), orden: 0, parrafo: actual.parrafo, texto: segunda });
  return numerar(lista);
}
