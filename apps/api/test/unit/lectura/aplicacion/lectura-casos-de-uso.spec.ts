import { beforeEach, describe, expect, it } from 'vitest';

import { ordenMostrado } from '../../../../src/modules/lectura/domain/services/correccion';
import { EVENTOS_INTEGRACION, NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoLectura, EntornoLectura, lecturaDeEjemplo, ORACIONES } from '../dobles';

/** Nivel 1 — Casos de uso de Lectura con dobles (RF-038 a RF-051, RN-17, RN-19). */
const NINO = 'nino-9';
const DOCENTE = 'docente';
const LECTURA = 'lectura-killa';

describe('Lectura interactiva: sesión del estudiante y revisión docente', () => {
  let e: EntornoLectura;

  beforeEach(() => {
    e = crearEntornoLectura();
    e.identidad.agregar(NINO, 'Mateo', 'R2');
    e.contenido.publicar(lecturaDeEjemplo());
  });

  let clave = 0;
  const responder = (sesionId: string, itemId: string, entrada: object) => e.sesiones.responder(NINO, sesionId, { itemId, idempotencyKey: `k-${++clave}`, ...entrada });

  /** Lee toda la lectura respondiendo bien; devuelve la sesión terminada. */
  const leerTodo = async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await e.sesiones.predecir(NINO, s.id, { texto: 'La llama se enfermará' });
    const bien: Record<string, object> = {
      'it-antes': { indice: 0 },
      'it-sel': { indice: 1 },
      'it-evid': { oraciones: ['o4'] },
      'it-ord': { orden: [0, 1, 2].map((k) => ordenMostrado(3, `${s.id}:it-ord`).indexOf(k)) },
      'it-esc': { texto: 'Porque tenía una espina en la pata' },
      'it-def': { indice: 0 },
    };
    for (;;) {
      const v = await e.sesiones.ver(NINO, s.id);
      if (!v.pregunta) break;
      await responder(s.id, v.pregunta.itemId, bien[v.pregunta.itemId] as object);
    }
    return e.sesiones.finalizar(NINO, s.id, 'Pensé que se enfermaba, pero era una espina');
  };

  it('RF-038: abre la lectura en la predicción, sin texto, y avisa a Aventura (SesionLecturaIniciada)', async () => {
    const v = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    expect(v).toMatchObject({ fase: 'PREDICCION', estado: 'INICIADA', pregunta: null, texto: { parrafos: [], completo: false } });
    expect(v.lectura).toEqual({ titulo: 'Killa y la llama', rangoEdad: 'R2', imagen: expect.any(Object), leerEnVozAlta: false });
    expect(e.bus.publicados[0]).toMatchObject({ nombreEvento: EVENTOS_INTEGRACION.SESION_LECTURA_INICIADA, datos: { estudianteId: NINO, lecturaId: LECTURA, esRepeticion: false } });
  });

  it('RF-046: al volver reanuda la misma sesión, en la misma pregunta y con sus pistas', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await e.sesiones.predecir(NINO, s.id, { texto: 'Algo le pasará' });
    await responder(s.id, 'it-antes', { indice: 0 });
    await responder(s.id, 'it-sel', { indice: 0 });
    const otra = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    expect(otra.id).toBe(s.id);
    expect(otra.pregunta).toMatchObject({ itemId: 'it-sel', numero: 2, total: 6, pistas: [{ nivel: 'P1' }], pistasRestantes: 2 });
    expect(otra.texto.parrafos.flatMap((p) => p.oraciones.map((o) => o.id))).toEqual(['o1', 'o2', 'o3']);
    expect(e.bus.nombres().filter((n) => n === EVENTOS_INTEGRACION.SESION_LECTURA_INICIADA)).toHaveLength(1);
  });

  it('la pregunta nunca lleva su clave; el orden llega mezclado', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await e.sesiones.predecir(NINO, s.id, { texto: 'x' });
    await responder(s.id, 'it-antes', { indice: 0 });
    await responder(s.id, 'it-sel', { indice: 1 });
    const v = await responder(s.id, 'it-evid', { oraciones: ['o3'] });
    const pregunta = v.sesion.pregunta!;
    expect(pregunta.itemId).toBe('it-ord');
    expect(pregunta.elementos).not.toEqual(['No quiso comer', 'Vio la espina', 'Le quitó la espina']);
    expect(JSON.stringify(v.sesion)).not.toMatch(/indicesCorrectos|clavesEvidencia|explicacion/);
  });

  it('RF-053: publica ItemRespondido al cerrar cada pregunta (no tras un error con pista ni al reenviar)', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await e.sesiones.predecir(NINO, s.id, { texto: 'x' });
    await responder(s.id, 'it-antes', { indice: 0 });
    const mal = await responder(s.id, 'it-sel', { indice: 0 });
    expect(mal).toMatchObject({ resultado: 'INCORRECTA', pista: { nivel: 'P1' } });
    const items = () => e.bus.publicados.filter((x) => x.nombreEvento === EVENTOS_INTEGRACION.ITEM_RESPONDIDO);
    expect(items()).toHaveLength(1);
    const k = 'misma-clave';
    await e.sesiones.responder(NINO, s.id, { itemId: 'it-sel', idempotencyKey: k, indice: 1 });
    await e.sesiones.responder(NINO, s.id, { itemId: 'it-sel', idempotencyKey: k, indice: 1 });
    expect(items()).toHaveLength(2);
    expect(items()[1]?.datos).toMatchObject({ itemId: 'it-sel', habilidad: 'INF', nivelDificultad: 3, esCorrecta: true, pistasUsadas: 1, puntajeItem: 0.75, palabras: null });
  });

  it('RF-045: pedir una pista guarda su uso y devuelve la pregunta con la pista', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await e.sesiones.predecir(NINO, s.id, { texto: 'x' });
    const r = await e.sesiones.pedirPista(NINO, s.id, 'it-antes');
    expect(r.pista).toMatchObject({ nivel: 'P1', texto: 'P1 de antes' });
    expect(r.sesion.pregunta).toMatchObject({ pistas: [{ nivel: 'P1' }], pistasRestantes: 0 });
  });

  it('RF-047: al terminar contrasta predicción y desenlace, publica SesionLecturaFinalizada y la próxima es repetición', async () => {
    e.escuela.aulas.set('aula-1', { docenteId: DOCENTE, nombre: '4.° A', estudiantes: [NINO] });
    const fin = await leerTodo();
    expect(fin).toMatchObject({ fase: 'FINALIZADA', estado: 'FINALIZADA', filtrado: false, reflexion: 'Pensé que se enfermaba, pero era una espina' });
    expect(fin.cierre).toEqual({
      prediccion: 'La llama se enfermará',
      desenlace: 'Con cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.',
      pregunta: expect.stringContaining('Se parece'),
    });
    expect(fin.resumen).toEqual({ preguntas: 6, sinAyuda: 5, conPista: 0, conExplicacion: 0, abiertas: 1 });
    expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_INTEGRACION.SESION_LECTURA_FINALIZADA, datos: { lecturaId: LECTURA, esRepeticion: false, preguntas: 6 } });
    expect(await e.repo.avanceDe(NINO, [LECTURA], new Date(0))).toEqual(new Map([[LECTURA, 'FINALIZADA']]));

    const otra = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    expect(otra.id).not.toBe(fin.id);
    expect(e.bus.publicados.at(-1)?.datos).toMatchObject({ esRepeticion: true });
  });

  it('una lectura de otra edad o no publicada no existe para el niño, salvo que su docente se la asigne', async () => {
    e.contenido.publicar(lecturaDeEjemplo({ lecturaId: 'lectura-r3', versionId: 'v-r3', rangoEdad: 'R3' }));
    await expect(e.sesiones.iniciar(NINO, { lecturaId: 'lectura-r3' })).rejects.toBeInstanceOf(NoEncontradoError);
    await expect(e.sesiones.iniciar(NINO, { lecturaId: 'lectura-r3', asignacionId: 'asig-otra' })).rejects.toBeInstanceOf(NoEncontradoError);
    e.escuela.asignaciones.push({ estudianteId: NINO, asignacionId: 'asig-1', lecturaId: 'lectura-r3' });
    const v = await e.sesiones.iniciar(NINO, { lecturaId: 'lectura-r3', asignacionId: 'asig-1' });
    expect(e.repo.filas.get(v.id)?.asignacionId).toBe('asig-1');
    await expect(e.sesiones.iniciar(NINO, { lecturaId: 'no-existe' })).rejects.toBeInstanceOf(NoEncontradoError);
    e.identidad.agregar('inactivo', 'Lía', 'R2', false);
    await expect(e.sesiones.iniciar('inactivo', { lecturaId: LECTURA })).rejects.toThrow('Estudiante no encontrado');
  });

  it('la sesión de otro niño responde como si no existiera', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    await expect(e.sesiones.ver('otro-nino', s.id)).rejects.toBeInstanceOf(NoEncontradoError);
    await expect(e.sesiones.ver(NINO, 'no-existe')).rejects.toBeInstanceOf(NoEncontradoError);
  });

  it('RF-027: la sesión sigue con su versión aunque luego se archive la lectura', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    e.contenido.archivar(LECTURA);
    expect((await e.sesiones.predecir(NINO, s.id, { texto: 'x' })).fase).toBe('ANTES');
    e.contenido.versiones.clear();
    await expect(e.sesiones.ver(NINO, s.id)).rejects.toBeInstanceOf(NoEncontradoError);
  });

  it('tras 7 días sin actividad la sesión se abandona y empezar abre una nueva', async () => {
    const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    e.reloj.avanzarMin(7 * 24 * 60);
    expect((await e.sesiones.ver(NINO, s.id)).fase).toBe('ABANDONADA');
    expect(e.bus.nombres()).toContain('lectura.SesionLecturaAbandonada');
    const nueva = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
    expect(nueva.id).not.toBe(s.id);
    expect(nueva.fase).toBe('PREDICCION');
  });

  it('dos pedidos a la vez abren una sola sesión', async () => {
    const [a, b] = await Promise.all([e.sesiones.iniciar(NINO, { lecturaId: LECTURA }), e.sesiones.iniciar(NINO, { lecturaId: LECTURA })]);
    expect(a.id).toBe(b.id);
    expect(e.repo.filas.size).toBe(1);
  });

  it('RF-048: decidir en la historia devuelve el nodo nuevo y su recorrido', async () => {
    e.contenido.publicar(lecturaDeEjemplo({ lecturaId: 'historia', versionId: 'v-historia', conHistoria: true }));
    const s = await e.sesiones.iniciar(NINO, { lecturaId: 'historia' });
    await e.sesiones.predecir(NINO, s.id, { texto: 'x' });
    await responder(s.id, 'it-antes', { indice: 0 });
    await responder(s.id, 'it-sel', { indice: 1 });
    const v = await responder(s.id, 'it-evid', { oraciones: ['o4'] });
    expect(v.sesion).toMatchObject({ fase: 'HISTORIA', pregunta: null, historia: { nodo: { id: 'n-inicio', opciones: ['Ir al río', 'Subir al cerro'] }, recorrido: [] } });
    const tras = await e.sesiones.decidir(NINO, s.id, { nodoId: 'n-inicio', opcion: 0 });
    expect(tras).toMatchObject({ fase: 'DESPUES', historia: { nodo: { id: 'n-rio', esFinal: true }, recorrido: [{ eleccion: 'Ir al río' }] }, pregunta: { itemId: 'it-ord' } });
  });

  describe('RF-051: revisión docente (RN-17)', () => {
    beforeEach(() => {
      e.escuela.aulas.set('aula-1', { docenteId: DOCENTE, nombre: '4.° A', estudiantes: [NINO] });
    });

    it('la docente ve las respuestas abiertas de su aula, con la defensa, y las valora una vez', async () => {
      await leerTodo();
      const pendientes = await e.revision.respuestas(DOCENTE, 'aula-1');
      expect(pendientes).toHaveLength(1);
      const r = pendientes[0]!;
      expect(r).toMatchObject({
        estado: 'PENDIENTE_REVISION',
        estudiante: { id: NINO, alias: 'Mateo' },
        lectura: { id: LECTURA, titulo: 'Killa y la llama' },
        pregunta: { habilidad: 'ARG' },
        respuesta: 'Porque tenía una espina en la pata',
        defiende: null,
        justificacion: 'Porque lo dice el texto',
        valoracion: null,
      });
      const valorada = await e.revision.valorar(DOCENTE, r.respuestaId, { nivel: 3, comentario: '¡Muy bien explicado!' });
      expect(valorada).toMatchObject({ estado: 'VALORADA', valoracion: { nivel: 3, comentario: '¡Muy bien explicado!' } });
      expect(e.bus.publicados.at(-1)).toMatchObject({
        nombreEvento: EVENTOS_INTEGRACION.RESPUESTA_ABIERTA_VALORADA,
        datos: { estudianteId: NINO, habilidad: 'ARG', nivel: 3, puntajeItem: 1, docenteId: DOCENTE },
      });
      expect(await e.revision.respuestas(DOCENTE, 'aula-1')).toEqual([]);
      expect(await e.revision.respuestas(DOCENTE, 'aula-1', 'VALORADA')).toHaveLength(1);
      await expect(e.revision.valorar(DOCENTE, r.respuestaId, { nivel: 2 })).rejects.toThrow('ya fue valorada');
    });

    it('otra docente no ve el aula ni puede valorar sus respuestas', async () => {
      await leerTodo();
      const [r] = await e.revision.respuestas(DOCENTE, 'aula-1');
      await expect(e.revision.respuestas('otra-docente', 'aula-1')).rejects.toThrow('Aula no encontrado');
      await expect(e.revision.valorar('otra-docente', r!.respuestaId, { nivel: 3 })).rejects.toBeInstanceOf(NoEncontradoError);
      await expect(e.revision.valorar(DOCENTE, 'no-existe', { nivel: 3 })).rejects.toBeInstanceOf(NoEncontradoError);
    });

    it('un aula sin estudiantes no tiene nada que revisar', async () => {
      e.escuela.aulas.set('aula-vacia', { docenteId: DOCENTE, nombre: 'Vacía', estudiantes: [] });
      expect(await e.revision.respuestas(DOCENTE, 'aula-vacia')).toEqual([]);
    });
  });

  describe('RF-064 (Módulo 9): historial para el detalle docente', () => {
    it('las sesiones más recientes primero, con lo que respondió, sus evidencias y sus pistas', async () => {
      const s1 = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
      await e.sesiones.predecir(NINO, s1.id, { texto: 'La llama se enfermará' });
      await responder(s1.id, 'it-antes', { indice: 0 });
      await responder(s1.id, 'it-sel', { indice: 0 }); // error: P1
      await responder(s1.id, 'it-sel', { indice: 1 });
      await responder(s1.id, 'it-evid', { oraciones: ['o4'] });
      await responder(s1.id, 'it-ord', { orden: [0, 1, 2].map((k) => ordenMostrado(3, `${s1.id}:it-ord`).indexOf(k)) });
      await responder(s1.id, 'it-esc', { texto: 'Porque tenía una espina en la pata' });
      await responder(s1.id, 'it-def', { indice: 0 });
      await e.sesiones.finalizar(NINO, s1.id, 'Era una espina');

      // La repite y, en la inferencia, se equivoca hasta ver la explicación (RF-045).
      e.reloj.avanzarMin(1);
      const s2 = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
      await e.sesiones.predecir(NINO, s2.id, { texto: 'Otra vez' });
      await responder(s2.id, 'it-antes', { indice: 0 });
      for (let i = 0; i < 5; i++) if ((await responder(s2.id, 'it-sel', { indice: 0 })).explicacion) break;

      const h = await e.historial.historialDe(NINO, 20);
      expect(h.map((x) => [x.sesionId, x.estado, x.esRepeticion, x.titulo])).toEqual([[s2.id, 'EN_CURSO', true, 'Killa y la llama'], [s1.id, 'FINALIZADA', false, 'Killa y la llama']]);
      expect(h[1]!.respuestas.map((r) => [r.itemId, r.esCorrecta, r.pistasUsadas, r.respuesta])).toEqual([
        ['it-antes', true, 0, 'Un animal'],
        ['it-sel', true, 1, 'Le dolía algo'],
        ['it-evid', true, 0, 'Killa vio que tenía una espina en la pata.'],
        ['it-ord', true, 0, 'No quiso comer → Vio la espina → Le quitó la espina'],
        ['it-esc', null, 0, 'Porque tenía una espina en la pata'],
        ['it-def', true, 0, 'Porque lo dice el texto'],
      ]);
      expect(h[1]!.respuestas[1]!.pistas).toEqual([{ nivel: 'P1', texto: 'P1 de sel' }]);
      expect(h[1]!.respuestas[2]!.evidencias).toEqual(['Killa vio que tenía una espina en la pata.']);
      expect(h[0]!.respuestas.find((r) => r.itemId === 'it-sel')!.pistas.at(-1)).toEqual({ nivel: 'EXPLICACION', texto: 'Explicación de it-sel: vuelve al texto.' });
      expect(JSON.stringify(h)).not.toMatch(/indicesCorrectos|clavesEvidencia/);
      expect(await e.historial.historialDe(NINO, 1)).toHaveLength(1);
      expect(await e.historial.historialDe('otro-nino', 20)).toEqual([]);
    });
  });

  describe('Módulo 11: lo que Lectura entrega al asistente (RF-073, RF-075)', () => {
    it('la pregunta en pantalla con el texto ya leído; la clave va aparte, solo para el filtro', async () => {
      const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
      expect(await e.asistencia.preguntaDe(NINO, s.id)).toMatchObject({ fase: 'PREDICCION', titulo: 'Killa y la llama', rangoEdad: 'R2', textoVisible: [], pregunta: null, claves: [] });

      await e.sesiones.predecir(NINO, s.id, { texto: 'La llama se enfermará' });
      await responder(s.id, 'it-antes', { indice: 0 });
      await responder(s.id, 'it-sel', { indice: 0 }); // error: usa la P1
      const p = (await e.asistencia.preguntaDe(NINO, s.id))!;
      expect(p).toMatchObject({ sesionId: s.id, lecturaId: LECTURA, fase: 'LECTURA' });
      expect(p.textoVisible).toEqual(['Killa vivía en Puno.', 'Cada mañana cuidaba a su llama Pancho.', 'Un día Pancho no quiso comer.']);
      expect(p.pregunta).toEqual({ itemId: 'it-sel', enunciado: 'Pregunta it-sel', habilidad: 'INF', modalidad: 'SELECCION', esCerrada: true, multiple: false, duranteLaLectura: true, pistasRestantes: 2 });
      expect(p.claves).toEqual(['Le dolía algo', 'Explicación de it-sel: vuelve al texto.']);
      // El contexto que verá el motor no trae la clave ni las opciones.
      expect(JSON.stringify({ ...p, claves: undefined })).not.toMatch(/Le dolía algo|indicesCorrectos|Explicación/);

      await responder(s.id, 'it-sel', { indice: 1 });
      expect((await e.asistencia.preguntaDe(NINO, s.id))!.claves).toEqual(['Un día Pancho no quiso comer.', 'Killa vio que tenía una espina en la pata.', 'Explicación de it-evid: vuelve al texto.']);
      await responder(s.id, 'it-evid', { oraciones: ['o4'] });
      const ord = (await e.asistencia.preguntaDe(NINO, s.id))!;
      expect(ord).toMatchObject({ fase: 'DESPUES', pregunta: { modalidad: 'ORDENAMIENTO', duranteLaLectura: false } });
      expect(ord.textoVisible).toHaveLength(6);
      expect(ord.claves).toEqual(expect.arrayContaining(['No quiso comer', 'Vio la espina', 'Le quitó la espina']));
    });

    it('la sesión de otro niño o que no existe no da nada', async () => {
      const s = await e.sesiones.iniciar(NINO, { lecturaId: LECTURA });
      expect(await e.asistencia.preguntaDe('otro-nino', s.id)).toBeNull();
      expect(await e.asistencia.preguntaDe(NINO, 'no-existe')).toBeNull();
    });

    it('RN-17: la docente recibe la respuesta abierta de su aula con el texto; las cerradas y las ajenas no', async () => {
      e.escuela.aulas.set('aula-1', { docenteId: DOCENTE, nombre: '4.° A', estudiantes: [NINO] });
      await leerTodo();
      const [abierta] = await e.revision.respuestas(DOCENTE, 'aula-1');
      expect(await e.asistencia.respuestaParaDocente(DOCENTE, abierta!.respuestaId)).toEqual({
        respuestaId: abierta!.respuestaId,
        estudianteId: NINO,
        rangoEdad: 'R2',
        enunciado: 'Pregunta it-esc',
        habilidad: 'ARG',
        minPalabras: 3,
        respuesta: 'Porque tenía una espina en la pata',
        texto: ORACIONES.map((o) => o.texto),
      });
      expect(await e.asistencia.respuestaParaDocente('otra-docente', abierta!.respuestaId)).toBeNull();
      expect(await e.asistencia.respuestaParaDocente(DOCENTE, 'no-existe')).toBeNull();
      const [sesion] = await e.repo.ultimasDe(NINO, 1);
      const cerrada = sesion!.respuestas.find((r) => r.itemId === 'it-sel')!;
      expect(await e.asistencia.respuestaParaDocente(DOCENTE, cerrada.id)).toBeNull();
    });
  });
});
