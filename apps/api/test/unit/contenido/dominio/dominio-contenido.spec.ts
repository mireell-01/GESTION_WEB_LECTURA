import { describe, expect, it } from 'vitest';

import { Lectura } from '../../../../src/modules/contenido/domain/entities/lectura';
import { PESO_MAXIMO_LECTURA, VersionLectura } from '../../../../src/modules/contenido/domain/entities/version-lectura';
import {
  AutorNoPuedeAprobarError,
  DatoLecturaInvalidoError,
  LecturaIncompletaError,
  NoEsAutorError,
  TransicionInvalidaError,
  VersionNoEditableError,
} from '../../../../src/modules/contenido/domain/errors/errores-contenido';
import { construirActividades, problemasDeActividades } from '../../../../src/modules/contenido/domain/services/actividades';
import { construirGrafo, problemasDelGrafo } from '../../../../src/modules/contenido/domain/services/grafo-historia';
import { detectarTipoMime, validarArchivo, validarDeclaracion } from '../../../../src/modules/contenido/domain/services/politica-recursos';
import { dividir, partirParrafo, segmentar, textoDe, unirConSiguiente } from '../../../../src/modules/contenido/domain/services/segmentador';
import { MetadatosLectura } from '../../../../src/modules/contenido/domain/value-objects/metadatos-lectura';
import { actividadesCompletas, meta, metadatos, TEXTO } from '../dobles';

/** Nivel 1 — Dominio de Contenido (RF-021 a RF-029, RN-06, RN-14, RN-15, RNF-006). */
const AHORA = new Date('2026-10-20T15:00:00Z');
const ids = () => {
  let n = 0;
  return () => `n-${++n}`;
};

describe('Metadatos de la lectura (RF-021)', () => {
  it('normaliza y acepta un borrador sin licencia ni habilidades', () => {
    const m = MetadatosLectura.de(metadatos({ titulo: '  El zorro  ', licencia: '  ', habilidadesObjetivo: [] }));
    expect(m.titulo).toBe('El zorro');
    expect(m.licencia).toBeNull();
  });

  it.each([
    [{ titulo: 'Ab' }, /título/],
    [{ rangoEdad: 'R4' }, /rango de edad/],
    [{ nivelDificultad: 6 }, /1 a 5/],
    [{ tematica: 'x' }, /temática/],
    [{ tipoTexto: 'NOVELA' }, /tipo de texto/],
    [{ habilidadesObjetivo: ['LIT', 'MAT'] }, /LIT, INF/],
  ])('rechaza %o', (cambio, mensaje) => {
    expect(() => MetadatosLectura.de(metadatos(cambio))).toThrow(mensaje);
  });
});

describe('Segmentación en oraciones (RF-022)', () => {
  it('corta tras . ! ? … sin cortar en abreviaturas, iniciales ni números', () => {
    expect(partirParrafo('El Sr. Pérez llegó. ¿Viste? ¡Sí! Midió 3.5 metros… Luego se fue.')).toEqual([
      'El Sr. Pérez llegó.', '¿Viste?', '¡Sí!', 'Midió 3.5 metros…', 'Luego se fue.',
    ]);
    expect(partirParrafo('Lo escribió J. R. Ribeyro. Es peruano.')).toEqual(['Lo escribió J. R. Ribeyro.', 'Es peruano.']);
    expect(partirParrafo('Dijo: "Ven aquí." Y vino.')).toEqual(['Dijo: "Ven aquí."', 'Y vino.']);
  });

  it('cada línea es un párrafo (los versos de un poema quedan separados)', () => {
    const o = segmentar('Verso uno\n\nVerso   dos\nVerso tres.', [], ids());
    expect(o.map((x) => [x.parrafo, x.texto])).toEqual([[1, 'Verso uno'], [2, 'Verso dos'], [3, 'Verso tres.']]);
    expect(textoDe(o)).toBe('Verso uno\n\nVerso dos\n\nVerso tres.');
  });

  it('las oraciones que no cambian conservan su id; las nuevas reciben uno nuevo', () => {
    const generar = ids();
    const antes = segmentar(TEXTO, [], generar);
    const despues = segmentar(TEXTO.replace('cada noche', 'todas las noches'), antes, generar);
    expect(despues.map((o) => o.id)).toEqual(['n-7', ...antes.slice(1).map((o) => o.id)]);
  });

  it('respeta un corte o una unión hechos a mano mientras su texto no cambie', () => {
    const generar = ids();
    const base = segmentar('Era un día gris y frío. Llovía.', [], generar);
    const unidas = unirConSiguiente(base, base[0]!.id).oraciones;
    const cortada = dividir(unidas, unidas[0]!.id, 'Era un día gris'.length, generar);
    expect(cortada.map((o) => o.texto)).toEqual(['Era un día gris', 'y frío. Llovía.']);
    // Se agrega una oración al final: los cortes manuales siguen.
    const resegmentada = segmentar('Era un día gris y frío. Llovía. Fin.', cortada, generar);
    expect(resegmentada.map((o) => o.texto)).toEqual(['Era un día gris', 'y frío. Llovía.', 'Fin.']);
    expect(resegmentada.slice(0, 2).map((o) => o.id)).toEqual(cortada.map((o) => o.id));
  });

  it('unir solo con la siguiente del mismo párrafo; dividir solo entre palabras', () => {
    const o = segmentar('Uno. Dos.\nTres.', [], ids());
    expect(() => unirConSiguiente(o, o[1]!.id)).toThrow(/mismo párrafo/);
    expect(() => dividir(o, o[0]!.id, 2, ids())).toThrow(/entre dos palabras/);
    expect(() => unirConSiguiente(o, 'no-existe')).toThrow(DatoLecturaInvalidoError);
  });

  it('límites: hasta 400 oraciones y 20 000 caracteres', () => {
    expect(() => segmentar('Hola. '.repeat(401), [], ids())).toThrow(/400 oraciones/);
    expect(() => segmentar('a'.repeat(20_001), [], ids())).toThrow(/20/);
  });
});

describe('Actividades, ítems y pistas (RF-024, RF-025, RN-06, RN-15)', () => {
  const oraciones = segmentar(TEXTO, [], ids());
  const set = new Set(oraciones.map((o) => o.id));
  const completas = () => construirActividades(actividadesCompletas(oraciones.map((o) => o.id)), set, ids());

  it('ordena por momento, numera y deriva si el ítem es cerrado', () => {
    const a = completas();
    expect(a.map((x) => [x.orden, x.momento])).toEqual([[1, 'ANTES'], [2, 'DURANTE'], [3, 'DESPUES']]);
    expect(a[1]!.items[0]).toMatchObject({ esCerrado: true, contenido: { opciones: ['Tocar la luna', 'Dormir', 'Comer'] }, respuestaCorrecta: { indice: 0 } });
    expect(a[0]!.items[0]!.esCerrado).toBe(false);
    expect(problemasDeActividades(a)).toEqual([]);
  });

  it.each([
    [{ momento: 'DURANTE', tipo: 'SELECCION', items: [] }, /oración donde aparece/],
    [{ momento: 'ANTES', tipo: 'SELECCION', items: [] }, /entre 1 y 10/],
    [{ momento: 'ANTES', tipo: 'EVIDENCIA', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: 'Pregunta', explicacionModelada: 'Porque sí' }] }, /no corresponde/],
    [{ momento: 'ANTES', tipo: 'SELECCION', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: 'Pregunta', opciones: ['A', 'a'], indiceCorrecto: 0, explicacionModelada: 'Porque sí' }] }, /repetidas/],
    [{ momento: 'ANTES', tipo: 'SELECCION', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: 'Pregunta', opciones: ['A', 'B'], indiceCorrecto: 5, explicacionModelada: 'Porque sí' }] }, /opción correcta/],
    [{ momento: 'ANTES', tipo: 'ORDENAMIENTO', items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'ORDENAMIENTO', enunciado: 'Ordena', elementos: ['Solo uno'], explicacionModelada: 'Porque sí' }] }, /de 2 a 8/],
    [{ momento: 'ANTES', tipo: 'SELECCION', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: 'Pregunta', opciones: ['A', 'B'], indiceCorrecto: 0, explicacionModelada: '' }] }, /explicación modelada/],
    [{ momento: 'ANTES', tipo: 'SELECCION', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: 'Pregunta', opciones: ['A', 'B'], indiceCorrecto: 0, explicacionModelada: 'Porque sí', pistas: [{ nivel: 'P2', texto: 'Segunda pista' }] }] }, /empezando por P1/],
    [{ momento: 'DESPUES', tipo: 'EVIDENCIA', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca', clavesEvidencia: ['otra-version'], explicacionModelada: 'Porque sí' }] }, /oraciones de esta lectura/],
  ])('rechaza estructuras imposibles al guardar (%#)', (actividad, mensaje) => {
    expect(() => construirActividades([actividad], set, ids())).toThrow(mensaje);
  });

  it('para enviar a revisión: actividad "después", P1 en cerrados, evidencias y pistas que no revelan la respuesta', () => {
    const a = completas();
    a.pop(); // sin actividad "después"
    a[1]!.items[0]!.pistas = [{ nivel: 'P1', texto: 'La respuesta es tocar la luna' }];
    const sinEvidencia = construirActividades([{ momento: 'DESPUES', tipo: 'EVIDENCIA', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca la oración', explicacionModelada: 'Porque sí' }] }], set, ids());
    expect(problemasDeActividades(a)).toEqual(['Agrega al menos una actividad para después de leer', 'Actividad 2, pregunta 1: una pista revela la respuesta correcta']);
    expect(problemasDeActividades(sinEvidencia)).toEqual(['Actividad 1, pregunta 1: falta la pista P1', 'Actividad 1, pregunta 1: marca las oraciones que son evidencia']);
  });

  it('RF-040: selección múltiple con 2 o más correctas (y no todas); ninguna pista puede nombrarlas', () => {
    const multiple = (indicesCorrectos: number[], pista = 'Mira el segundo párrafo') =>
      construirActividades(
        [{ momento: 'DESPUES', tipo: 'SELECCION', items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: '¿Qué hizo Killa?', opciones: ['Cuidó a Pancho', 'Voló', 'Le quitó la espina'], indicesCorrectos, explicacionModelada: 'Lo dice el texto', pistas: [{ nivel: 'P1', texto: pista }] }] }],
        set,
        ids(),
      );
    expect(multiple([2, 0, 2])[0]!.items[0]).toMatchObject({ esCerrado: true, contenido: { opciones: expect.any(Array), multiple: true }, respuestaCorrecta: { indices: [0, 2] } });
    expect(() => multiple([1])).toThrow(/al menos 2 opciones correctas/);
    expect(() => multiple([0, 1, 2])).toThrow(/y no todas/);
    expect(() => multiple([0, 7])).toThrow(/al menos 2 opciones correctas/);
    expect(problemasDeActividades(multiple([0, 2], 'Piensa en: le quitó la espina'))).toEqual(['Actividad 1, pregunta 1: una pista revela la respuesta correcta']);
  });
});

describe('Historia ramificada (RF-029)', () => {
  const nodo = (clave: string, opciones: string[] = [], extra = {}) => ({
    clave, contenido: `Texto de ${clave}`, opciones: opciones.map((d) => ({ texto: `Ir a ${d}`, destino: d })), ...extra,
  });

  it('una historia válida: un inicio, decisiones que llevan a finales, sin ciclos', () => {
    const g = construirGrafo([nodo('inicio', ['a', 'b'], { esInicio: true }), nodo('a', ['fin']), nodo('b', [], { esFinal: true }), nodo('fin', [], { esFinal: true })], ids());
    expect(problemasDelGrafo(g)).toEqual([]);
    expect(problemasDelGrafo([])).toEqual([]);
  });

  it('al guardar exige nombres únicos y destinos que existan', () => {
    expect(() => construirGrafo([nodo('a'), nodo('a')], ids())).toThrow(/mismo nombre/);
    expect(() => construirGrafo([nodo('a', ['zeta'])], ids())).toThrow(/no existe/);
  });

  it('antes de publicar detecta ciclos, nodos sueltos, finales con decisiones y nodos sin salida', () => {
    const ciclo = construirGrafo([nodo('i', ['x'], { esInicio: true }), nodo('x', ['y']), nodo('y', ['x']), nodo('f', [], { esFinal: true })], ids());
    expect(problemasDelGrafo(ciclo)).toEqual(expect.arrayContaining([expect.stringMatching(/ciclo/), expect.stringMatching(/No se llega desde el inicio a: "f"/)]));
    const raro = construirGrafo([nodo('i', ['f']), nodo('f', ['i'], { esFinal: true }), nodo('s')], ids());
    expect(problemasDelGrafo(raro)).toEqual(expect.arrayContaining([
      'La historia debe tener exactamente un nodo de inicio',
      'El final "f" no debe tener decisiones',
      'El nodo "s" necesita al menos una decisión o ser un final',
    ]));
  });
});

describe('Recursos (RF-023)', () => {
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(20)]);
  const avif = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypavif'), Buffer.alloc(20)]);

  it('reconoce el formato real por su firma', () => {
    expect(detectarTipoMime(webp)).toBe('image/webp');
    expect(detectarTipoMime(avif)).toBe('image/avif');
    expect(detectarTipoMime(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)]))).toBe('audio/mpeg');
    expect(detectarTipoMime(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(20)]))).toBe('audio/ogg');
    expect(detectarTipoMime(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Buffer.alloc(20)]))).toBe('audio/webm');
    expect(detectarTipoMime(Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(20)]))).toBe('audio/mp4');
    expect(detectarTipoMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(detectarTipoMime(Buffer.alloc(3))).toBeNull();
  });

  it('declaración: formato permitido, límites de peso y texto alternativo obligatorio para imágenes', () => {
    expect(validarDeclaracion({ tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: 1000, textoAlternativo: ' Un zorro mira la luna ' }))
      .toEqual({ tipo: 'IMAGEN', textoAlternativo: 'Un zorro mira la luna', duracionSeg: null });
    expect(() => validarDeclaracion({ tipo: 'IMAGEN', tipoMime: 'image/png', bytes: 1000, textoAlternativo: 'Zorro' })).toThrow(/WebP o AVIF/);
    expect(() => validarDeclaracion({ tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: 200 * 1024 + 1, textoAlternativo: 'Zorro' })).toThrow(/200 KB/);
    expect(() => validarDeclaracion({ tipo: 'IMAGEN', tipoMime: 'image/webp', bytes: 10 })).toThrow(/texto alternativo/);
    expect(() => validarDeclaracion({ tipo: 'AUDIO', tipoMime: 'audio/mpeg', bytes: 2 * 1024 * 1024 + 1 })).toThrow(/2 MB/);
    expect(validarDeclaracion({ tipo: 'AUDIO', tipoMime: 'audio/ogg', bytes: 500, duracionSeg: 30 }).duracionSeg).toBe(30);
    expect(() => validarDeclaracion({ tipo: 'VIDEO', tipoMime: 'video/mp4', bytes: 10 })).toThrow(/imagen o un audio/);
  });

  it('el archivo debe ser exactamente lo declarado', () => {
    expect(() => validarArchivo(webp, { tipoMime: 'image/webp', bytes: webp.length })).not.toThrow();
    expect(() => validarArchivo(webp, { tipoMime: 'image/webp', bytes: webp.length + 1 })).toThrow(/tamaño/);
    expect(() => validarArchivo(webp, { tipoMime: 'image/avif', bytes: webp.length })).toThrow(/formato/);
  });
});

describe('Versión de una lectura: flujo de publicación (RF-026, RF-027, RN-14, RN-15)', () => {
  const borrador = (autorId = 'editora') =>
    VersionLectura.crearBorrador({ id: 'v1', lecturaId: 'l1', numero: 1, metadatos: meta(), texto: TEXTO, autorId, ahora: AHORA, generarId: ids() });
  const completa = () => {
    const v = borrador();
    v.reemplazarActividades(actividadesCompletas(v.propsSnapshot.oraciones.map((o) => o.id)), ids());
    return v;
  };

  it('nace en borrador, segmentada; solo su autor la edita', () => {
    const v = borrador();
    expect(v.estado).toBe('BORRADOR');
    expect(v.propsSnapshot.oraciones).toHaveLength(6);
    expect(() => v.asegurarEditablePor('otro-editor')).toThrow(NoEsAutorError);
  });

  it('cambiar el texto conserva anclajes y evidencias de lo que no cambió, y avisa de lo que se ajustó', () => {
    const v = completa();
    expect(v.actualizar({ texto: `${TEXTO}\nFin.` }, ids())).toEqual([]);
    // Se borra la oración evidencia ("Pero la luna seguía lejos.") y la anclada ("Quería tocarla...").
    const ajustes = v.actualizar({ texto: TEXTO.replace(' Quería tocarla con su nariz.', '').replace(' Pero la luna seguía lejos.', '') }, ids());
    expect(ajustes).toEqual([
      'Actividad 2: su oración cambió; revisa dónde aparece',
      'Actividad 3, pregunta 1: se quitaron evidencias que ya no están en el texto',
    ]);
    const anclaje = v.propsSnapshot.actividades[1]!.oracionAnclajeId;
    expect(v.propsSnapshot.oraciones.some((o) => o.id === anclaje)).toBe(true);
    expect(v.problemasParaRevision()).toContain('Actividad 3, pregunta 1: marca las oraciones que son evidencia');
  });

  it('al unir oraciones, el anclaje y la evidencia de la absorbida pasan a la que queda', () => {
    const v = completa();
    const [primera, segunda] = v.propsSnapshot.oraciones;
    v.unirOraciones(primera!.id);
    expect(v.propsSnapshot.actividades[1]!.oracionAnclajeId).toBe(primera!.id);
    expect(v.propsSnapshot.oraciones.some((o) => o.id === segunda!.id)).toBe(false);
  });

  it('enviar exige licencia, habilidades y actividades completas', () => {
    const v = borrador();
    v.actualizar({ metadatos: meta({ licencia: null, habilidadesObjetivo: [] }) }, ids());
    expect(() => v.enviarARevision('editora', AHORA)).toThrow(LecturaIncompletaError);
    try {
      v.enviarARevision('editora', AHORA);
    } catch (e) {
      expect((e as LecturaIncompletaError).problemas).toEqual([
        'Declara la licencia del texto',
        'Elige al menos una habilidad objetivo',
        'Agrega al menos una actividad para después de leer',
      ]);
    }
  });

  it('el autor no aprueba lo suyo; otra persona la publica y ya no se edita', () => {
    const v = completa();
    v.enviarARevision('editora', AHORA);
    expect(v.estado).toBe('EN_REVISION');
    expect(() => v.asegurarEditablePor('editora')).toThrow(VersionNoEditableError);
    expect(() => v.aprobar('editora', AHORA)).toThrow(AutorNoPuedeAprobarError);
    v.aprobar('revisor', AHORA);
    expect(v.propsSnapshot).toMatchObject({ estado: 'PUBLICADO', revisorId: 'revisor', publicadaEn: AHORA });
    expect(() => v.aprobar('revisor', AHORA)).toThrow(TransicionInvalidaError);
    v.archivar(AHORA);
    expect(v.estado).toBe('ARCHIVADO');
  });

  it('rechazar vuelve a borrador con el motivo, que se limpia al reenviar', () => {
    const v = completa();
    v.enviarARevision('editora', AHORA);
    expect(() => v.rechazar('revisor', 'no')).toThrow(/5 a 1000/);
    v.rechazar('revisor', 'Revisa la pista P1 de la actividad 2.');
    expect(v.propsSnapshot).toMatchObject({ estado: 'BORRADOR', comentarioRevision: 'Revisa la pista P1 de la actividad 2.' });
    v.enviarARevision('editora', AHORA);
    expect(v.propsSnapshot.comentarioRevision).toBeNull();
  });

  it('RF-027: la versión nueva copia todo con ids propios y remapea anclajes y evidencias', () => {
    const publicada = completa();
    publicada.enviarARevision('editora', AHORA);
    publicada.aprobar('revisor', AHORA);
    const nueva = VersionLectura.nuevaDesde(publicada, { id: 'v2', numero: 2, autorId: 'otra-editora', ahora: AHORA, generarId: () => `x-${Math.random()}` });
    const p = nueva.propsSnapshot;
    const anteriores = new Set(publicada.propsSnapshot.oraciones.map((o) => o.id));
    expect(p).toMatchObject({ estado: 'BORRADOR', numero: 2, autorId: 'otra-editora', revisorId: null });
    expect(p.oraciones.every((o) => !anteriores.has(o.id))).toBe(true);
    expect(p.oraciones.map((o) => o.texto)).toEqual(publicada.propsSnapshot.oraciones.map((o) => o.texto));
    const ids2 = new Set(p.oraciones.map((o) => o.id));
    expect(ids2.has(p.actividades[1]!.oracionAnclajeId as string)).toBe(true);
    expect(ids2.has(p.actividades[2]!.items[0]!.clavesEvidencia[0] as string)).toBe(true);
    expect(nueva.problemasParaRevision()).toEqual([]);
    expect(() => VersionLectura.nuevaDesde(nueva, { id: 'v3', numero: 3, autorId: 'x', ahora: AHORA, generarId: ids() })).toThrow(TransicionInvalidaError);
  });

  it('RNF-006: una lectura que pesa más de 1,5 MB no se envía', () => {
    const v = completa();
    v.agregarRecurso({ id: 'r1', tipo: 'AUDIO', claveAlmacen: 'k', tipoMime: 'audio/mpeg', bytes: PESO_MAXIMO_LECTURA, textoAlternativo: null, duracionSeg: 60, creadoEn: AHORA });
    expect(v.problemasParaRevision()).toEqual([expect.stringMatching(/^La lectura pesa 1,5\d MB; el máximo es 1,5 MB$/)]);
    v.quitarRecurso('r1');
    expect(v.problemasParaRevision()).toEqual([]);
    expect(() => v.quitarRecurso('r1')).toThrow(/no está en esta lectura/);
  });
});

describe('Lectura: la versión publicada vigente (RF-027)', () => {
  it('publicar devuelve la versión anterior; archivar la saca de circulación', () => {
    const l = Lectura.crear({ id: 'l1', autorId: 'editora', ahora: AHORA });
    expect(l.publicar('v1')).toBeNull();
    expect(l.publicar('v2')).toBe('v1');
    l.archivar(AHORA);
    expect(l.propsSnapshot).toMatchObject({ versionPublicadaId: null, archivadaEn: AHORA });
    expect(() => l.archivar(AHORA)).toThrow(TransicionInvalidaError);
  });
});
