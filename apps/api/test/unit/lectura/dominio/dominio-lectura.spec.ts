import { describe, expect, it } from 'vitest';

import { SesionLectura } from '../../../../src/modules/lectura/domain/entities/sesion-lectura';
import {
  LecturaIncompletaError,
  PasoFueraDeOrdenError,
  RespuestaInvalidaError,
  SinPistasError,
  TransicionSesionError,
  ValoracionInvalidaError,
} from '../../../../src/modules/lectura/domain/errors/errores-lectura';
import { corregir, evidenciaCorrecta, ordenMostrado } from '../../../../src/modules/lectura/domain/services/correccion';
import { filtrarPalabras, palabrasDe } from '../../../../src/modules/lectura/domain/services/filtro-palabras';
import { CONSIGNA_PREDICCION, Guion } from '../../../../src/modules/lectura/domain/services/guion';
import { puntajeDeRubrica, puntajeItem } from '../../../../src/modules/lectura/domain/services/politica-pistas';
import { lecturaDeEjemplo } from '../dobles';

/** Nivel 1 — Dominio de la lectura interactiva (RF-038 a RF-051, RN-06, RN-07). */
const AHORA = new Date('2026-10-22T15:00:00Z');
let n = 0;
const id = () => `gen-${++n}`;

function sesionNueva(g: Guion) {
  return SesionLectura.iniciar({ id: 'ses-1', estudianteId: 'nino', lecturaId: g.contenido.lecturaId, versionLecturaId: g.contenido.versionId, asignacionId: null, esRepeticion: false, ahora: AHORA });
}

const responder = (s: SesionLectura, g: Guion, itemId: string, entrada: object, clave = id()) => s.responder(g, { itemId, entrada, idempotencyKey: clave, ahora: AHORA, generarId: id });

/** Lleva la sesión hasta la pregunta indicada respondiendo bien lo anterior. */
function hasta(s: SesionLectura, g: Guion, itemId: string) {
  if (s.estado === 'INICIADA') s.predecir(g, { texto: 'Creo que la llama se enfermará' }, AHORA);
  const correctas: Record<string, object> = {
    'it-antes': { indice: 0 },
    'it-sel': { indice: 1 },
    'it-evid': { oraciones: ['o4'] },
    'it-ord': { orden: [0, 1, 2].map((k) => ordenMostrado(3, `${s.id}:it-ord`).indexOf(k)) },
    'it-esc': { texto: 'Porque tenía una espina' },
    'it-def': { indice: 0 },
  };
  for (const p of g.pasos) {
    if (p.item.id === itemId) return;
    if (s.pasoEnPantalla(g)?.item.id === p.item.id) responder(s, g, p.item.id, correctas[p.item.id] as object);
  }
}

describe('Guion de la lectura (RF-038, RF-039)', () => {
  const g = new Guion(lecturaDeEjemplo());

  it('la predicción va primero y sale del ítem PREDICCION; el resto sigue antes → durante (por anclaje) → después', () => {
    expect(g.prediccion).toEqual({ itemId: 'it-pred', enunciado: '¿Qué crees que le pasará a la llama?', opciones: [] });
    expect(g.pasos.map((p) => `${p.fase}:${p.item.id}`)).toEqual(['ANTES:it-antes', 'LECTURA:it-sel', 'LECTURA:it-evid', 'DESPUES:it-ord', 'DESPUES:it-esc', 'DESPUES:it-def']);
    expect(g.pasos.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(g.paso('it-sel')?.hastaOracion).toBe(3);
    expect(g.paso('it-def')?.defiende?.id).toBe('it-esc'); // RF-044: defiende la pregunta anterior
  });

  it('sin ítem de predicción usa la consigna del título y la imagen; con opciones, se elige', () => {
    const sinPrediccion = lecturaDeEjemplo();
    sinPrediccion.actividades = sinPrediccion.actividades.filter((a) => a.tipo !== 'PREDICCION');
    expect(new Guion(sinPrediccion).prediccion).toEqual({ itemId: null, enunciado: CONSIGNA_PREDICCION, opciones: [] });
    expect(new Guion(lecturaDeEjemplo({ prediccionConOpciones: true })).prediccion.opciones).toEqual(['Se enfermará', 'Viajará']);
  });

  it('RN-06: la evidencia resalta su párrafo desde P1; las demás, el del anclaje desde P2; RF-047: el desenlace', () => {
    expect(g.parrafoDePista(g.paso('it-evid')!, 'P1')).toBe(2);
    expect(g.parrafoDePista(g.paso('it-sel')!, 'P1')).toBeNull();
    expect(g.parrafoDePista(g.paso('it-sel')!, 'P2')).toBe(2);
    expect(g.parrafoDePista(g.paso('it-ord')!, 'P2')).toBeNull();
    expect(g.desenlace(null)).toBe('Con cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.');
    const h = new Guion(lecturaDeEjemplo({ conHistoria: true }));
    expect(h.desenlace('n-rio')).toBe('En el río, Pancho bebió agua fresca.');
  });
});

describe('Corrección en el servidor (RF-040 a RF-043)', () => {
  const g = new Guion(lecturaDeEjemplo());
  const ctx = { claveOrden: 'ses:it-ord', oracionesValidas: new Set(['o1', 'o2', 'o3', 'o4']) };

  it('selección única y múltiple', () => {
    const sel = g.paso('it-sel')!.item;
    expect(corregir(sel, { indice: 1 }, ctx).esCorrecta).toBe(true);
    expect(corregir(sel, { indice: 0 }, ctx).esCorrecta).toBe(false);
    expect(() => corregir(sel, { indice: 7 }, ctx)).toThrow(RespuestaInvalidaError);
    const multiple = { ...sel, multiple: true, indicesCorrectos: [0, 2] };
    expect(corregir(multiple, { indices: [2, 0] }, ctx)).toMatchObject({ esCorrecta: true, contenido: { indices: [0, 2] } });
    expect(corregir(multiple, { indices: [0] }, ctx).esCorrecta).toBe(false);
    expect(() => corregir(multiple, { indices: [] }, ctx)).toThrow('Elige una o más opciones');
  });

  it('RF-042: el orden mostrado es estable, nunca viene ya ordenado y se responde con sus posiciones', () => {
    for (const clave of ['a', 'b', 'c', 'd', 'e']) {
      const mostrado = ordenMostrado(3, clave);
      expect(mostrado).toEqual(ordenMostrado(3, clave));
      expect(mostrado).not.toEqual([0, 1, 2]);
      expect([...mostrado].sort()).toEqual([0, 1, 2]);
    }
    expect(ordenMostrado(1, 'x')).toEqual([0]);
    const ord = g.paso('it-ord')!.item;
    const mostrado = ordenMostrado(3, ctx.claveOrden);
    const bien = [0, 1, 2].map((k) => mostrado.indexOf(k));
    expect(corregir(ord, { orden: bien }, ctx).esCorrecta).toBe(true);
    expect(corregir(ord, { orden: [...bien].reverse() }, ctx).esCorrecta).toBe(false);
    expect(() => corregir(ord, { orden: [0, 0, 1] }, ctx)).toThrow('Ordena todos los elementos');
  });

  it('RF-043 (UAT-03): correcta con ≥ 1 oración de la clave y ≤ 1 ajena', () => {
    expect(evidenciaCorrecta(['o-013'], ['o-012', 'o-013'])).toBe(true);
    expect(evidenciaCorrecta(['o-002', 'o-020'], ['o-012', 'o-013'])).toBe(false);
    expect(evidenciaCorrecta(['o-012', 'o-002'], ['o-012', 'o-013'])).toBe(true);
    expect(evidenciaCorrecta(['o-012', 'o-002', 'o-020'], ['o-012', 'o-013'])).toBe(false);
    const evid = g.paso('it-evid')!.item;
    expect(() => corregir(evid, { oraciones: [] }, ctx)).toThrow(RespuestaInvalidaError);
    expect(() => corregir(evid, { oraciones: ['o6'] }, ctx)).toThrow('Elige oraciones del texto que estás leyendo');
  });

  it('RF-041: escritura de hasta 500 caracteres, con mínimo de palabras y filtro; RF-049: dictada', () => {
    const esc = g.paso('it-esc')!.item;
    expect(corregir(esc, { texto: '  Porque tenía una espina ' }, ctx)).toEqual({ contenido: { texto: 'Porque tenía una espina', porVoz: false }, esCorrecta: null, filtrado: false });
    expect(() => corregir(esc, { texto: 'Espina' }, ctx)).toThrow('al menos 3 palabras');
    expect(() => corregir(esc, { texto: 'a'.repeat(501) }, ctx)).toThrow('hasta 500');
    expect(() => corregir(esc, { texto: '   ' }, ctx)).toThrow('Escribe tu respuesta');
    expect(corregir(esc, { texto: 'eres un idiota pancho', porVoz: true }, ctx)).toMatchObject({ contenido: { texto: 'eres un ****** pancho', porVoz: true }, filtrado: true });
  });
});

describe('Filtro de palabras (RF-041)', () => {
  it('cubre tildes, mayúsculas, letras repetidas, plurales y sustituciones', () => {
    expect(filtrarPalabras('¡Qué ESTÚPIDO!').texto).toBe('¡Qué ********!');
    expect(filtrarPalabras('idiotaaa').filtrado).toBe(true);
    expect(filtrarPalabras('son unos idiotas').texto).toBe('son unos *******');
    expect(filtrarPalabras('1d10t4').filtrado).toBe(true);
  });

  it('no toca palabras de los cuentos ni partes de otras palabras', () => {
    for (const t of ['La zorra engañó al cuy', 'La perra cuidaba a sus cachorros', 'Encontré una concha en la playa', 'Computadora y disputa']) {
      expect(filtrarPalabras(t)).toEqual({ texto: t, filtrado: false });
    }
    expect(palabrasDe('Killa, la niña de Puno.')).toBe(5);
  });
});

describe('Puntaje del ítem (RN-07) y rúbrica (RF-051)', () => {
  it('1 · 0,75 · 0,5 · 0,25 según las pistas; 0 con la explicación', () => {
    expect([0, 1, 2, 3].map((p) => puntajeItem(p, false))).toEqual([1, 0.75, 0.5, 0.25]);
    expect(puntajeItem(3, true)).toBe(0);
    expect([1, 2, 3].map(puntajeDeRubrica)).toEqual([0.33, 0.67, 1]);
  });
});

describe('SesionLectura', () => {
  const g = new Guion(lecturaDeEjemplo());

  it('RF-038: sin predicción no hay texto ni preguntas; al predecir se abre la lectura (una sola vez)', () => {
    const s = sesionNueva(g);
    expect(s.fase(g)).toBe('PREDICCION');
    expect(s.oracionesVisibles(g)).toEqual([]);
    expect(() => responder(s, g, 'it-antes', { indice: 0 })).toThrow(TransicionSesionError);
    expect(() => s.predecir(g, { texto: '  ' }, AHORA)).toThrow(RespuestaInvalidaError);
    s.predecir(g, { texto: 'Se pondrá triste' }, AHORA);
    expect(s.estado).toBe('EN_CURSO');
    expect(s.prediccion).toBe('Se pondrá triste');
    expect(s.fase(g)).toBe('ANTES');
    expect(s.oracionesVisibles(g)).toEqual([]); // lo "antes" sigue sin texto
    expect(() => s.predecir(g, { texto: 'otra' }, AHORA)).toThrow('Ya contaste');
  });

  it('con opciones, la predicción es la opción elegida', () => {
    const h = new Guion(lecturaDeEjemplo({ prediccionConOpciones: true }));
    const s = sesionNueva(h);
    expect(() => s.predecir(h, { indice: 5 }, AHORA)).toThrow('Elige lo que crees que pasará');
    s.predecir(h, { indice: 1 }, AHORA);
    expect(s.prediccion).toBe('Viajará');
  });

  it('RF-039: el texto llega hasta la oración de anclaje y no se salta la pregunta en pantalla', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-sel');
    expect(s.fase(g)).toBe('LECTURA');
    expect(s.oracionesVisibles(g).map((o) => o.id)).toEqual(['o1', 'o2', 'o3']);
    expect(() => responder(s, g, 'it-evid', { oraciones: ['o4'] })).toThrow(PasoFueraDeOrdenError);
    expect(() => responder(s, g, 'no-existe', { indice: 0 })).toThrow('no es parte de esta lectura');
    responder(s, g, 'it-sel', { indice: 1 });
    expect(s.oracionesVisibles(g).map((o) => o.id)).toEqual(['o1', 'o2', 'o3', 'o4']);
    expect(() => responder(s, g, 'it-sel', { indice: 1 })).toThrow('Ya respondiste esta pregunta');
  });

  it('RF-045 (UAT-02): P1 → P2 → P3 → explicación; la pista nunca trae la respuesta y el puntaje baja (RN-07)', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-sel');
    const r1 = responder(s, g, 'it-sel', { indice: 0 });
    expect(r1).toMatchObject({ resultado: 'INCORRECTA', pista: { nivel: 'P1', texto: 'P1 de sel', parrafo: null }, explicacion: null, resuelta: false });
    expect(JSON.stringify(r1.pista)).not.toContain('Le dolía algo');
    expect(responder(s, g, 'it-sel', { indice: 2 }).pista).toEqual({ nivel: 'P2', texto: 'P2 de sel', parrafo: 2 });
    expect(responder(s, g, 'it-sel', { indice: 0 }).pista?.nivel).toBe('P3');
    const fin = responder(s, g, 'it-sel', { indice: 0 });
    expect(fin).toMatchObject({ resultado: 'INCORRECTA', pista: null, explicacion: 'Explicación de it-sel: vuelve al texto.', resuelta: true });
    expect(s.respuestaDe('it-sel')).toMatchObject({ pistasUsadas: 3, puntajeItem: 0, esCorrecta: false });
    expect(s.pasoEnPantalla(g)?.item.id).toBe('it-evid'); // tras la explicación puede seguir
  });

  it('acertar tras una pista vale 0,75', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-sel');
    responder(s, g, 'it-sel', { indice: 0 });
    expect(responder(s, g, 'it-sel', { indice: 1 })).toMatchObject({ resultado: 'CORRECTA', resuelta: true });
    expect(s.respuestaDe('it-sel')?.puntajeItem).toBe(0.75);
  });

  it('RF-046: reenviar el mismo pedido devuelve el mismo resultado sin volver a corregir', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-sel');
    const primera = responder(s, g, 'it-sel', { indice: 0 }, 'clave-1');
    const repetida = responder(s, g, 'it-sel', { indice: 0 }, 'clave-1');
    expect(repetida).toMatchObject({ repetido: true, resultado: 'INCORRECTA', pista: primera.pista });
    expect(s.respuestaDe('it-sel')?.pistasUsadas).toBe(1);
    responder(s, g, 'it-sel', { indice: 1 }, 'clave-2');
    expect(responder(s, g, 'it-sel', { indice: 1 }, 'clave-2')).toMatchObject({ repetido: true, resultado: 'CORRECTA' });
  });

  it('RF-045: pedir pista antes de responder, hasta agotarlas; sin pistas, la explicación llega al fallar', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-evid');
    expect(s.pedirPista(g, { itemId: 'it-evid', ahora: AHORA, generarId: id })).toEqual({ nivel: 'P1', texto: 'P1 de evid', parrafo: 2 });
    expect(() => s.pedirPista(g, { itemId: 'it-evid', ahora: AHORA, generarId: id })).toThrow(SinPistasError);
    expect(s.pistasRecibidas(g, g.paso('it-evid')!)).toHaveLength(1);
    // UAT-03: oraciones ajenas → incorrecta; como ya usó su única pista, ve la explicación.
    expect(responder(s, g, 'it-evid', { oraciones: ['o1', 'o2'] })).toMatchObject({ resultado: 'INCORRECTA', explicacion: expect.any(String), resuelta: true });
  });

  it('RF-044: la defensa queda asociada a la respuesta original y no se puede omitir', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-def');
    expect(() => s.finalizar(g, { reflexion: 'Me gustó', ahora: AHORA, conDocente: false })).toThrow(LecturaIncompletaError);
    responder(s, g, 'it-def', { indice: 1 }); // mal: aún no se asocia
    expect(s.respuestaDe('it-esc')?.justificacion).toBeNull();
    responder(s, g, 'it-def', { indice: 0 });
    expect(s.respuestaDe('it-esc')?.justificacion).toMatchObject({ modalidad: 'SELECCION', opcionElegida: { indices: [0], texto: 'Porque lo dice el texto' } });
    expect(s.fase(g)).toBe('CIERRE');
  });

  it('RF-047, RF-051: el cierre pide reflexión; con docente, lo abierto pasa a revisión y se valora una vez', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'fin');
    expect(s.pendientes(g)).toBe(0);
    expect(() => s.finalizar(g, { reflexion: '', ahora: AHORA, conDocente: true })).toThrow(RespuestaInvalidaError);
    s.finalizar(g, { reflexion: 'Pensé que se enfermaba y era una espina', ahora: AHORA, conDocente: true });
    expect(s.estado).toBe('FINALIZADA');
    expect(s.fase(g)).toBe('FINALIZADA');
    expect(s.resumen(g)).toEqual({ preguntas: 6, sinAyuda: 5, conPista: 0, conExplicacion: 0, abiertas: 1 });
    const abierta = s.respuestaDe('it-esc')!;
    expect(abierta.estado).toBe('PENDIENTE_REVISION');
    expect(() => responder(s, g, 'it-esc', { texto: 'otra respuesta más' })).toThrow('Esta lectura ya terminó');

    expect(() => s.valorar({ respuestaId: abierta.id, docenteId: 'doc', nivel: 4, ahora: AHORA })).toThrow(RespuestaInvalidaError);
    expect(() => s.valorar({ respuestaId: s.respuestaDe('it-sel')!.id, docenteId: 'doc', nivel: 3, ahora: AHORA })).toThrow('aún no espera revisión');
    const valorada = s.valorar({ respuestaId: abierta.id, docenteId: 'doc', nivel: 2, comentario: ' Buen inicio ', ahora: AHORA });
    expect(valorada).toMatchObject({ estado: 'VALORADA', puntajeItem: 0.67, valoracion: { nivel: 2, comentario: 'Buen inicio' } });
    expect(() => s.valorar({ respuestaId: abierta.id, docenteId: 'doc', nivel: 3, ahora: AHORA })).toThrow(ValoracionInvalidaError);
    expect(() => s.valorar({ respuestaId: 'otra', docenteId: 'doc', nivel: 3, ahora: AHORA })).toThrow('Respuesta no encontrado');
  });

  it('sin docente, lo abierto queda enviado (RN-19)', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'fin');
    s.finalizar(g, { reflexion: 'Me gustó', ahora: AHORA, conDocente: false });
    expect(s.respuestaDe('it-esc')?.estado).toBe('ENVIADA');
  });

  it('RF-048: la historia ramificada va tras el texto y antes de lo "después"; cada decisión define el nodo siguiente', () => {
    const h = new Guion(lecturaDeEjemplo({ conHistoria: true }));
    const s = sesionNueva(h);
    hasta(s, h, 'it-ord');
    expect(s.fase(h)).toBe('HISTORIA');
    expect(s.pasoEnPantalla(h)).toBeNull();
    expect(() => responder(s, h, 'it-ord', { orden: [0, 1, 2] })).toThrow(PasoFueraDeOrdenError);
    expect(() => s.decidir(h, { nodoId: 'n-rio', opcion: 0, ahora: AHORA, generarId: id })).toThrow('Elige en la parte de la historia');
    expect(() => s.decidir(h, { nodoId: 'n-inicio', opcion: 5, ahora: AHORA, generarId: id })).toThrow('Elige uno de los caminos');
    expect(s.decidir(h, { nodoId: 'n-inicio', opcion: 1, ahora: AHORA, generarId: id }).clave).toBe('cerro');
    expect(s.fase(h)).toBe('HISTORIA');
    s.decidir(h, { nodoId: 'n-cerro', opcion: 0, ahora: AHORA, generarId: id });
    expect(s.nodoActual(h)?.esFinal).toBe(true);
    expect(s.fase(h)).toBe('DESPUES');
    expect(s.decisiones.map((d) => `${d.nodoOrigenId}→${d.nodoDestinoId}`)).toEqual(['n-inicio→n-cerro', 'n-cerro→n-casa']);
    expect(s.cambios().decisiones).toHaveLength(2);
    expect(() => s.decidir(h, { nodoId: 'n-casa', opcion: 0, ahora: AHORA, generarId: id })).toThrow('Todavía no es momento');
  });

  it('SRS §3.6: tras 7 días sin actividad queda ABANDONADA y ya no admite respuestas', () => {
    const s = sesionNueva(g);
    s.predecir(g, { texto: 'Algo pasará' }, AHORA);
    expect(s.abandonarSiInactiva(new Date(AHORA.getTime() + 6 * 86_400_000))).toBe(false);
    expect(s.abandonarSiInactiva(new Date(AHORA.getTime() + 7 * 86_400_000))).toBe(true);
    expect(s.fase(g)).toBe('ABANDONADA');
    expect(s.abandonarSiInactiva(new Date(AHORA.getTime() + 8 * 86_400_000))).toBe(false);
    expect(() => responder(s, g, 'it-antes', { indice: 0 })).toThrow('se cerró por falta de actividad');
    expect(() => s.predecir(g, { texto: 'x' }, AHORA)).toThrow(TransicionSesionError);
  });

  it('los cambios se informan al repositorio y se limpian al confirmar', () => {
    const s = sesionNueva(g);
    hasta(s, g, 'it-evid');
    expect(s.cambios().respuestas.map((r) => r.itemId)).toEqual(['it-antes', 'it-sel']);
    s.confirmarCambios();
    expect(s.cambios()).toEqual({ respuestas: [], decisiones: [] });
    const copia = SesionLectura.desdePersistencia(structuredClone(s.propsSnapshot) as SesionLectura['propsSnapshot']);
    expect(copia.respuestaDe('it-sel')?.esCorrecta).toBe(true);
  });
});
