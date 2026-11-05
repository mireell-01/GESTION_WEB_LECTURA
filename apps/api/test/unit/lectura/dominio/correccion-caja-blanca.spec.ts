import { describe, expect, it } from 'vitest';

import { RespuestaInvalidaError } from '../../../../src/modules/lectura/domain/errors/errores-lectura';
import { corregir, EntradaRespuesta, ordenMostrado } from '../../../../src/modules/lectura/domain/services/correccion';
import { ItemLectura } from '../../../../src/modules/lectura/domain/value-objects/contenido-lectura';

/**
 * Nivel 1 — Caja blanca de corregir(), la función que decide si el niño acertó (RF-040 a RF-043).
 * Los casos CB-01 a CB-28 son una base de caminos linealmente independientes: V(G) = 27 predicados + 1 = 28,
 * calculado cuando era una sola función. Al dividirla por modalidad, los mismos 28 caminos siguen existiendo.
 * Los LIM-xx no agregan caminos: fijan los límites numéricos que una simplificación suele romper.
 * El análisis está en docs/pruebas/14-caja-blanca-corregir.md.
 */
const BASE: ItemLectura = {
  id: 'it-1',
  orden: 1,
  habilidad: 'INF',
  nivelDificultad: 2,
  modalidad: 'SELECCION',
  esCerrado: true,
  enunciado: '¿Qué pasó con Pancho?',
  opciones: [],
  indicesCorrectos: [],
  multiple: false,
  elementos: [],
  minPalabras: null,
  explicacionModelada: 'El texto lo dice en el segundo párrafo.',
  pistas: [],
  clavesEvidencia: [],
};
const item = (cambios: Partial<ItemLectura>): ItemLectura => ({ ...BASE, ...cambios });

const OPCIONES = ['Estaba feliz', 'Le dolía algo', 'Tenía sueño', 'Quería jugar'];
const UNICA = item({ opciones: OPCIONES, indicesCorrectos: [1] });
const MULTIPLE = item({ opciones: OPCIONES, indicesCorrectos: [0, 2], multiple: true });
const ORDENAR = item({ modalidad: 'ORDENAMIENTO', elementos: ['Primero', 'Después', 'Al final'] });
const EVIDENCIA = item({ modalidad: 'EVIDENCIA', clavesEvidencia: ['o1', 'o2'] });
const ESCRITURA = item({ modalidad: 'ESCRITURA', esCerrado: false });
const VOZ = item({ modalidad: 'VOZ', esCerrado: false });

const CTX = { claveOrden: 'ses-1:it-ord', oracionesValidas: new Set(['o1', 'o2', 'o3', 'o4']) };
const corrige = (i: ItemLectura, entrada: EntradaRespuesta) => corregir(i, entrada, CTX);

function rechaza(i: ItemLectura, entrada: EntradaRespuesta, mensaje: string | RegExp) {
  expect(() => corrige(i, entrada)).toThrow(RespuestaInvalidaError);
  expect(() => corrige(i, entrada)).toThrow(mensaje);
}

/** Lo que responde un niño que acierta: las posiciones de cada elemento en la lista mezclada que vio. */
const ORDEN_BIEN = [0, 1, 2].map((k) => ordenMostrado(3, CTX.claveOrden).indexOf(k));

describe('[Lectura][Core][Fast] corregir: caja blanca de los 28 caminos (RF-040 a RF-043)', () => {
  describe('selección única', () => {
    it('CB-01: acierta', () => {
      expect(corrige(UNICA, { indice: 1 })).toEqual({ contenido: { indice: 1 }, esCorrecta: true, filtrado: false });
    });

    it('CB-02: un ítem abierto no se corrige', () => {
      expect(corrige({ ...UNICA, esCerrado: false }, { indice: 1 }).esCorrecta).toBeNull();
    });

    it('CB-03: índice fuera de las opciones', () => {
      rechaza(UNICA, { indice: 9 }, 'Elige una de las opciones');
    });
  });

  describe('selección múltiple', () => {
    it('CB-04: acierta, en cualquier orden, y se guarda ordenada', () => {
      expect(corrige(MULTIPLE, { indices: [2, 0] })).toEqual({ contenido: { indices: [0, 2] }, esCorrecta: true, filtrado: false });
    });

    it('CB-05: sin el campo indices', () => {
      rechaza(MULTIPLE, {}, 'Elige una o más opciones');
    });

    it('CB-06: lista vacía', () => {
      rechaza(MULTIPLE, { indices: [] }, 'Elige una o más opciones');
    });

    it('CB-07: un índice fuera de las opciones', () => {
      rechaza(MULTIPLE, { indices: [0, 9] }, 'Elige una o más opciones');
    });

    it('CB-08: marca solo una parte de las correctas: no es acierto', () => {
      expect(corrige(MULTIPLE, { indices: [0] }).esCorrecta).toBe(false);
    });

    it('CB-09: un ítem abierto no se corrige', () => {
      expect(corrige({ ...MULTIPLE, esCerrado: false }, { indices: [0, 2] }).esCorrecta).toBeNull();
    });
  });

  describe('ordenamiento', () => {
    it('CB-10: acierta con las posiciones de la lista mezclada', () => {
      expect(corrige(ORDENAR, { orden: ORDEN_BIEN })).toEqual({ contenido: { orden: ORDEN_BIEN }, esCorrecta: true, filtrado: false });
    });

    it('CB-11: sin el campo orden', () => {
      rechaza(ORDENAR, {}, 'Ordena todos los elementos');
    });

    it('CB-12: faltan elementos', () => {
      rechaza(ORDENAR, { orden: [0, 1] }, 'Ordena todos los elementos');
    });

    it('CB-13: un elemento repetido', () => {
      rechaza(ORDENAR, { orden: [0, 0, 1] }, 'Ordena todos los elementos');
    });

    it('CB-14: una posición fuera de la lista', () => {
      rechaza(ORDENAR, { orden: [0, 1, 7] }, 'Ordena todos los elementos');
    });
  });

  describe('evidencia', () => {
    it('CB-15: acierta con una oración de la clave', () => {
      expect(corrige(EVIDENCIA, { oraciones: ['o1'] })).toEqual({ contenido: { oraciones: ['o1'] }, esCorrecta: true, filtrado: false });
    });

    it('CB-16: sin el campo oraciones', () => {
      rechaza(EVIDENCIA, {}, 'Toca las oraciones del texto');
    });

    it('CB-17: lista vacía', () => {
      rechaza(EVIDENCIA, { oraciones: [] }, 'Toca las oraciones del texto');
    });

    it('CB-18: una oración que no es del texto que está leyendo', () => {
      rechaza(EVIDENCIA, { oraciones: ['o1', 'o99'] }, 'Elige oraciones del texto que estás leyendo');
    });
  });

  describe('escritura', () => {
    it('CB-19: la abierta no se corrige: la valora la docente (RF-051)', () => {
      expect(corrige(ESCRITURA, { texto: '  Porque tenía una espina ' })).toEqual({
        contenido: { texto: 'Porque tenía una espina', porVoz: false },
        esCorrecta: null,
        filtrado: false,
      });
    });

    it('CB-20: sin el campo texto', () => {
      rechaza(ESCRITURA, {}, 'Escribe tu respuesta');
    });

    it('CB-21: solo espacios', () => {
      rechaza(ESCRITURA, { texto: '   ' }, 'Escribe tu respuesta');
    });

    it('CB-22: más de 500 caracteres', () => {
      rechaza(ESCRITURA, { texto: 'a'.repeat(501) }, 'hasta 500 letras');
    });

    it('CB-23: exactamente el mínimo de palabras alcanza', () => {
      expect(corrige({ ...ESCRITURA, minPalabras: 3 }, { texto: 'tenía una espina' }).contenido).toMatchObject({ texto: 'tenía una espina' });
    });

    it('CB-24: una palabra menos que el mínimo, en plural', () => {
      rechaza({ ...ESCRITURA, minPalabras: 3 }, { texto: 'una espina' }, /al menos 3 palabras$/);
    });

    it('CB-25: mínimo de 1 con texto sin palabras, en singular', () => {
      // Parece inalcanzable (un texto no vacío ya tendría una palabra), pero los signos no cuentan como palabras.
      rechaza({ ...ESCRITURA, minPalabras: 1 }, { texto: '¡¡!!' }, /al menos 1 palabra$/);
    });
  });

  describe('voz', () => {
    it('CB-26: el texto dictado se marca como tal (RF-049)', () => {
      expect(corrige(VOZ, { texto: 'tenía una espina', porVoz: true })).toEqual({
        contenido: { texto: 'tenía una espina', porVoz: true },
        esCorrecta: null,
        filtrado: false,
      });
    });

    it('CB-27: vacío, con el mensaje de quien dicta', () => {
      rechaza(VOZ, { texto: ' ' }, 'Di o escribe tu respuesta');
    });
  });

  it('CB-28: una modalidad desconocida es un error del sistema, no una respuesta mal escrita del niño', () => {
    const rara = item({ modalidad: 'DIBUJO' as never });
    expect(() => corrige(rara, {})).toThrow('Modalidad desconocida: DIBUJO');
    expect(() => corrige(rara, {})).not.toThrow(RespuestaInvalidaError);
  });
});

describe('[Lectura][Core][Fast] corregir: límites numéricos e invariantes', () => {
  it('LIM-01: los índices válidos van de 0 a n−1, enteros', () => {
    expect(corrige(item({ opciones: OPCIONES, indicesCorrectos: [0] }), { indice: 0 }).esCorrecta).toBe(true);
    expect(corrige(item({ opciones: OPCIONES, indicesCorrectos: [3] }), { indice: 3 }).esCorrecta).toBe(true);
    for (const malo of [-1, 4, 1.5, Number.NaN, '1' as never]) rechaza(UNICA, { indice: malo }, 'Elige una de las opciones');
    for (const malo of [-1, 4, 1.5]) rechaza(MULTIPLE, { indices: [0, malo] }, 'Elige una o más opciones');
  });

  it('LIM-02: múltiple: repetir una opción no cambia el resultado', () => {
    expect(corrige(MULTIPLE, { indices: [0, 0, 2] })).toMatchObject({ contenido: { indices: [0, 2] }, esCorrecta: true });
  });

  it('LIM-03: múltiple: la misma cantidad con una equivocada, o marcar de más, no es acierto', () => {
    expect(corrige(MULTIPLE, { indices: [0, 1] }).esCorrecta).toBe(false);
    expect(corrige(MULTIPLE, { indices: [0, 1, 2] }).esCorrecta).toBe(false);
  });

  it('LIM-04: orden: al revés no es acierto y una posición no entera se rechaza', () => {
    expect(corrige(ORDENAR, { orden: [...ORDEN_BIEN].reverse() }).esCorrecta).toBe(false);
    rechaza(ORDENAR, { orden: [0, 1, 1.5] }, 'Ordena todos los elementos');
  });

  it('LIM-05: evidencia: como mucho 1 oración ajena; repetir una oración no cuenta dos veces (RF-043)', () => {
    expect(corrige(EVIDENCIA, { oraciones: ['o1', 'o3'] }).esCorrecta).toBe(true);
    expect(corrige(EVIDENCIA, { oraciones: ['o1', 'o3', 'o4'] }).esCorrecta).toBe(false);
    expect(corrige(EVIDENCIA, { oraciones: ['o3'] }).esCorrecta).toBe(false);
    expect(corrige(EVIDENCIA, { oraciones: ['o1', 'o3', 'o3'] })).toMatchObject({ contenido: { oraciones: ['o1', 'o3'] }, esCorrecta: true });
  });

  it('LIM-06: el tope de 500 cuenta después de quitar los espacios de los extremos', () => {
    expect(corrige(ESCRITURA, { texto: 'a'.repeat(500) }).esCorrecta).toBeNull();
    expect(corrige(ESCRITURA, { texto: `  ${'a'.repeat(500)}  ` }).esCorrecta).toBeNull();
  });

  it('LIM-07: porVoz solo es verdadero con el booleano true', () => {
    expect(corrige(VOZ, { texto: 'hola', porVoz: 'true' as never }).contenido).toMatchObject({ porVoz: false });
    expect(corrige(VOZ, { texto: 'hola', porVoz: false }).contenido).toMatchObject({ porVoz: false });
  });

  it('LIM-08: un texto que no es string se convierte, no rompe la corrección', () => {
    expect(corrige(ESCRITURA, { texto: 123 as never }).contenido).toMatchObject({ texto: '123' });
  });

  it('LIM-09: sin mínimo de palabras (null o 0) alcanza con una sola', () => {
    expect(corrige({ ...ESCRITURA, minPalabras: 0 }, { texto: 'sí' }).esCorrecta).toBeNull();
  });

  it('LIM-10: el filtro de palabras se aplica y se avisa (RF-041)', () => {
    const r = corrige(ESCRITURA, { texto: 'eres un idiota pancho' });
    expect(r.filtrado).toBe(true);
    expect(JSON.stringify(r.contenido)).not.toContain('idiota');
  });

  it('LIM-11: ordenMostrado también mezcla con la clave cuyo hash FNV-1a es 0', () => {
    const orden = ordenMostrado(5, 'qzs0UD');
    expect([...orden].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(orden).not.toEqual([0, 1, 2, 3, 4]);
  });
});
