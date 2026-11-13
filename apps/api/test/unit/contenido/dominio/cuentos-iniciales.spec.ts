import { describe, expect, it } from 'vitest';

import {
  actividadesDe,
  DIFICULTAD,
  HABILIDADES_DEL_MUNDO,
  LICENCIA,
  licenciaDe,
  metadatosDe,
  moralejaDe,
  parrafosDe,
  preguntaDeVida,
  preguntasDe,
  textoDe,
} from '../../../../prisma/contenido-inicial/armar.mjs';
import { CUENTOS } from '../../../../prisma/contenido-inicial/index.mjs';
import { VALORES } from '../../../../prisma/contenido-inicial/valores.mjs';
import { construirActividades, problemasDeActividades } from '../../../../src/modules/contenido/domain/services/actividades';
import { segmentar } from '../../../../src/modules/contenido/domain/services/segmentador';
import { MetadatosLectura } from '../../../../src/modules/contenido/domain/value-objects/metadatos-lectura';

/**
 * Nivel 1 — El contenido inicial (los cuentos de los 5 mundos) se puede publicar tal cual: pasa las mismas
 * validaciones del dominio que usa la API (RF-021 a RF-025, RN-06, RN-15), sin base de datos. Además, cada cuento
 * deja un valor para la vida (su moraleja y una pregunta que lo lleva a la vida del niño) y se lee con la
 * facilidad que corresponde a su edad.
 */
interface Pregunta {
  tipo: string;
  habilidad: string;
  enunciado: string;
  correctas?: string[];
  elementos?: string[];
  pistas?: string[];
  durante?: string;
  oraciones?: string[];
  vida?: boolean;
}
interface Cuento {
  clave: string;
  mundo: 1 | 2 | 3 | 4 | 5;
  rango: 'R1' | 'R2' | 'R3';
  orden: number;
  titulo: string;
  tipoTexto?: string;
  autor?: string;
  valor: string;
  moraleja: string;
  vida: string | [string, string, string[]];
  mision: { titulo: string; descripcion: string };
  texto: string[][];
  prediccion: string;
  preguntas: Pregunta[];
}

const cuentos = CUENTOS as Cuento[];
let n = 0;
const id = () => `id-${++n}`;
const normal = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Lo que verá el niño: las oraciones tal como las corta el dominio. */
const oracionesDe = (c: Cuento) => segmentar(textoDe(c), [], id);

/** Cuántas oraciones (sin contar la moraleja) y palabras por oración admite cada edad. */
const LIMITES = { R1: { oraciones: [5, 12], palabras: 18 }, R2: { oraciones: [9, 18], palabras: 24 }, R3: { oraciones: [12, 26], palabras: 32 } };

/**
 * Legibilidad INFLESZ (Szigriszt-Pazos, la escala de Flesch adaptada al castellano): 206,835 − 62,3 × sílabas por
 * palabra − palabras por oración. Más de 80 es «muy fácil»; de 65 a 80, «bastante fácil»; de 55 a 65, «normal».
 */
const VOCALES = 'aeiouáéíóúü';
const FUERTES = 'aeoáéó';
function silabas(palabra: string): number {
  let total = 0;
  let previa = '';
  for (const ch of palabra.toLocaleLowerCase('es')) {
    if (VOCALES.includes(ch)) {
      if (!VOCALES.includes(previa)) total++;
      else if (FUERTES.includes(previa) && FUERTES.includes(ch)) total++; // hiato: le-ón
      else if ('íú'.includes(ch) || 'íú'.includes(previa)) total++; // hiato con tilde: dí-a
    }
    previa = ch;
  }
  return Math.max(1, total);
}
function inflesz(oraciones: string[]): number {
  const palabras = oraciones.flatMap((o) => o.match(/\p{L}+/gu) ?? []);
  const s = palabras.reduce((t, p) => t + silabas(p), 0);
  return 206.835 - 62.3 * (s / palabras.length) - palabras.length / oraciones.length;
}
/** Cada cuento, al menos así de fácil para su edad; y en promedio, más fácil cuanto menor es el niño. */
const LEGIBILIDAD_MINIMA = { R1: 72, R2: 65, R3: 55 };

describe('[Contenido][Menor][Fast] Contenido inicial: los cuentos de los 5 mundos', () => {
  it('cada mundo tiene 5 misiones para cada edad (3 cuentos propios y 2 clásicos), sin títulos repetidos', () => {
    expect(cuentos).toHaveLength(75);
    expect(new Set(cuentos.map((c) => c.clave)).size).toBe(75);
    expect(new Set(cuentos.map((c) => c.titulo)).size).toBe(75);
    expect(new Set(cuentos.map((c) => c.mision.titulo)).size).toBe(75);
    for (const rango of ['R1', 'R2', 'R3'] as const) {
      for (const mundo of [1, 2, 3, 4, 5] as const) {
        const suyos = cuentos.filter((c) => c.rango === rango && c.mundo === mundo);
        expect(suyos.map((c) => c.orden).sort(), `${rango}, mundo ${mundo}`).toEqual([1, 2, 3, 4, 5]);
        expect(suyos.filter((c) => c.autor).map((c) => c.orden).sort(), `${rango}, mundo ${mundo}: los clásicos`).toEqual([4, 5]);
      }
    }
  });

  it('las misiones de cada mundo miden todas sus habilidades foco, y solo esas (RN-09); la pregunta del valor es de pensamiento crítico', () => {
    for (const rango of ['R1', 'R2', 'R3'] as const) {
      for (const mundo of [1, 2, 3, 4, 5] as const) {
        const foco = HABILIDADES_DEL_MUNDO[mundo];
        const medidas = new Set(cuentos.filter((c) => c.rango === rango && c.mundo === mundo).flatMap((c) => c.preguntas.map((p) => p.habilidad)));
        expect([...medidas].sort(), `${rango}, mundo ${mundo}`).toEqual([...foco].sort());
      }
    }
    for (const c of cuentos) expect(['CRI', 'ARG'], c.titulo).toContain(preguntaDeVida(c).habilidad);
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: los metadatos son válidos (RF-021) y la licencia dice de dónde viene', (_clave, c) => {
    const m = metadatosDe(c);
    expect(() => MetadatosLectura.de(m)).not.toThrow();
    expect(m.licencia).toBe(licenciaDe(c));
    expect(m.licencia).toBe(c.autor ? `CC BY 4.0 · Adaptación con IA de ${c.autor} (dominio público); requiere revisión pedagógica` : LICENCIA);
    expect(m.licencia.length).toBeLessThanOrEqual(120);
    expect(m.nivelDificultad).toBe(DIFICULTAD[c.rango][c.mundo]);
    expect(c.mision.titulo.length).toBeLessThanOrEqual(120);
    expect(c.mision.descripcion.length).toBeLessThanOrEqual(600);
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: el dominio corta las oraciones tal como se escribieron', (_clave, c) => {
    expect(oracionesDe(c).map((o) => o.texto)).toEqual(parrafosDe(c).flat());
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: el largo del texto es el de su edad', (_clave, c) => {
    const oraciones = oracionesDe(c);
    const { oraciones: [min, max], palabras } = LIMITES[c.rango];
    const delCuento = oraciones.length - 1; // sin la moraleja
    expect(delCuento).toBeGreaterThanOrEqual(min);
    expect(delCuento).toBeLessThanOrEqual(max);
    for (const o of oraciones) expect(o.texto.split(/\s+/).length, o.texto).toBeLessThanOrEqual(palabras);
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: se lee con la facilidad de su edad (INFLESZ)', (_clave, c) => {
    expect(inflesz(c.texto.flat())).toBeGreaterThanOrEqual(LEGIBILIDAD_MINIMA[c.rango]);
  });

  it('en promedio, los textos son más fáciles cuanto menor es el niño', () => {
    const promedio = (rango: string) => {
      const suyos = cuentos.filter((c) => c.rango === rango).map((c) => inflesz(c.texto.flat()));
      return suyos.reduce((a, b) => a + b, 0) / suyos.length;
    };
    expect(promedio('R1')).toBeGreaterThan(promedio('R2'));
    expect(promedio('R2')).toBeGreaterThan(promedio('R3'));
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: deja un valor para la vida, con su moraleja al final y una pregunta para pensar en él', (_clave, c) => {
    expect(VALORES).toContain(c.valor);
    // La moraleja es una sola oración, al final del texto: así se lee y se escucha con el resto.
    const ultimo = oracionesDe(c).at(-1);
    expect(ultimo?.texto).toBe(moralejaDe(c));
    expect(ultimo?.texto).toMatch(/^(Moraleja|Para reflexionar): \p{Ll}.+\.$/u);
    expect(segmentar(c.moraleja, [], id)).toHaveLength(1);
    // La pregunta del valor va después de leer: de 6 a 7 años elige qué haría; desde los 8 lo escribe.
    const vida = preguntasDe(c).at(-1) as Pregunta;
    expect(vida.vida).toBe(true);
    expect(vida.durante).toBeUndefined();
    expect(vida.tipo).toBe(c.rango === 'R1' ? 'SELECCION' : 'ESCRITURA');
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: se puede enviar a revisión sin problemas (RN-06, RN-15)', (_clave, c) => {
    const oraciones = oracionesDe(c);
    const actividades = construirActividades(actividadesDe(c, oraciones), new Set(oraciones.map((o) => o.id)), id);
    expect(problemasDeActividades(actividades)).toEqual([]);
    expect(actividades.filter((a) => a.momento === 'DESPUES').length).toBeGreaterThanOrEqual(1);
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: lo que se pregunta durante la lectura ya se leyó (RF-039)', (_clave, c) => {
    const oraciones = oracionesDe(c);
    const orden = (texto: string) => oraciones.find((o) => o.texto === texto)?.orden ?? Number.NaN;
    for (const p of c.preguntas.filter((x) => x.durante)) {
      for (const o of p.oraciones ?? []) expect(orden(o), `${p.enunciado}: «${o}» llega después del anclaje`).toBeLessThanOrEqual(orden(p.durante as string));
    }
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: ninguna pista dice la respuesta ni el orden (RN-06)', (_clave, c) => {
    for (const p of preguntasDe(c) as Pregunta[]) {
      const respuestas = [...(p.correctas ?? []), ...(p.elementos ?? [])].map(normal).filter((r) => r.length >= 3);
      for (const pista of (p.pistas ?? []).map(normal)) {
        for (const r of respuestas) expect(pista.includes(r), `${p.enunciado}: la pista «${pista}» dice «${r}»`).toBe(false);
      }
    }
  });
});
