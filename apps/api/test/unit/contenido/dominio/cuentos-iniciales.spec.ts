import { describe, expect, it } from 'vitest';

import { actividadesDe, DIFICULTAD, HABILIDADES_DEL_MUNDO, LICENCIA, metadatosDe, textoDe } from '../../../../prisma/contenido-inicial/armar.mjs';
import { CUENTOS } from '../../../../prisma/contenido-inicial/index.mjs';
import { construirActividades, problemasDeActividades } from '../../../../src/modules/contenido/domain/services/actividades';
import { segmentar } from '../../../../src/modules/contenido/domain/services/segmentador';
import { MetadatosLectura } from '../../../../src/modules/contenido/domain/value-objects/metadatos-lectura';

/**
 * Nivel 1 — El contenido inicial (los cuentos de los 5 mundos) se puede publicar tal cual: pasa las mismas
 * validaciones del dominio que usa la API (RF-021 a RF-025, RN-06, RN-15), sin base de datos.
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
}
interface Cuento {
  clave: string;
  mundo: 1 | 2 | 3 | 4 | 5;
  rango: 'R1' | 'R2' | 'R3';
  orden: number;
  titulo: string;
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

/** Cuántas oraciones y palabras por oración admite cada edad (textos cortos y frases simples para los más chicos). */
const LIMITES = { R1: { oraciones: [5, 12], palabras: 18 }, R2: { oraciones: [9, 18], palabras: 24 }, R3: { oraciones: [12, 26], palabras: 32 } };

describe('[Contenido][Menor][Fast] Contenido inicial: los cuentos de los 5 mundos', () => {
  it('cada mundo tiene 3 misiones para cada edad, con un cuento cada una y sin títulos repetidos', () => {
    expect(cuentos).toHaveLength(45);
    expect(new Set(cuentos.map((c) => c.clave)).size).toBe(45);
    expect(new Set(cuentos.map((c) => c.titulo)).size).toBe(45);
    expect(new Set(cuentos.map((c) => c.mision.titulo)).size).toBe(45);
    for (const rango of ['R1', 'R2', 'R3'] as const) {
      for (const mundo of [1, 2, 3, 4, 5] as const) {
        const suyos = cuentos.filter((c) => c.rango === rango && c.mundo === mundo);
        expect(suyos.map((c) => c.orden).sort(), `${rango}, mundo ${mundo}`).toEqual([1, 2, 3]);
      }
    }
  });

  it('las misiones de cada mundo miden todas sus habilidades foco, y solo esas (RN-09)', () => {
    for (const rango of ['R1', 'R2', 'R3'] as const) {
      for (const mundo of [1, 2, 3, 4, 5] as const) {
        const foco = HABILIDADES_DEL_MUNDO[mundo];
        const medidas = new Set(cuentos.filter((c) => c.rango === rango && c.mundo === mundo).flatMap((c) => c.preguntas.map((p) => p.habilidad)));
        expect([...medidas].sort(), `${rango}, mundo ${mundo}`).toEqual([...foco].sort());
      }
    }
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: los metadatos son válidos (RF-021)', (_clave, c) => {
    const m = metadatosDe(c);
    expect(() => MetadatosLectura.de(m)).not.toThrow();
    expect(m.licencia).toBe(LICENCIA);
    expect(m.nivelDificultad).toBe(DIFICULTAD[c.rango][c.mundo]);
    expect(c.mision.titulo.length).toBeLessThanOrEqual(120);
    expect(c.mision.descripcion.length).toBeLessThanOrEqual(600);
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: el dominio corta las oraciones tal como se escribieron', (_clave, c) => {
    expect(oracionesDe(c).map((o) => o.texto)).toEqual(c.texto.flat());
  });

  it.each(cuentos.map((c) => [c.clave, c] as const))('%s: el largo del texto es el de su edad', (_clave, c) => {
    const oraciones = oracionesDe(c);
    const { oraciones: [min, max], palabras } = LIMITES[c.rango];
    expect(oraciones.length).toBeGreaterThanOrEqual(min);
    expect(oraciones.length).toBeLessThanOrEqual(max);
    for (const o of oraciones) expect(o.texto.split(/\s+/).length, o.texto).toBeLessThanOrEqual(palabras);
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
    for (const p of c.preguntas) {
      const respuestas = [...(p.correctas ?? []), ...(p.elementos ?? [])].map(normal).filter((r) => r.length >= 3);
      for (const pista of (p.pistas ?? []).map(normal)) {
        for (const r of respuestas) expect(pista.includes(r), `${p.enunciado}: la pista «${pista}» dice «${r}»`).toBe(false);
      }
    }
  });
});
