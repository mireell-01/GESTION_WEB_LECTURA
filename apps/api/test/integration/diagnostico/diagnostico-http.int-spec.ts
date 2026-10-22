import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Diagnóstico integrado (RF-034 a RF-037, RN-05) contra PostgreSQL real: el reto con el
 * banco cargado por la migración, pausa y reanudación, el nivel por habilidad, la posición inicial
 * en el mapa de Aventura (RF-033) por el evento real, y la reevaluación del docente.
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';

let t: AppDePrueba;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

async function docente() {
  const email = `docente.${uuidV7().slice(-6)}@lectoaventura.test`;
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Pérez', email, contrasena: CONTRASENA, rol: 'DOCENTE' }).expect(201);
  const enlace = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  return (await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken as string;
}

/** Respuesta correcta de un ítem según el banco (para elegir aciertos a propósito). */
async function correcta(itemId: string) {
  const fila = await t.prisma.bancoItemDiagnostico.findUniqueOrThrow({ where: { id: itemId } });
  return { indice: (fila.respuestaCorrecta as { indice: number }).indice, habilidad: fila.habilidad, opciones: (fila.contenido as { opciones: string[] }).opciones.length };
}

/** Responde todo lo que falta; acierta solo en las habilidades indicadas. */
async function responderTodo(token: string, id: string, acertar: string[]) {
  for (;;) {
    const { item } = (await t.http().get(`${API}/diagnosticos/${id}/siguiente-item`).set(bearer(token)).expect(200)).body;
    if (!item) return;
    const c = await correcta(item.itemId);
    const indice = acertar.includes(c.habilidad) ? c.indice : (c.indice + 1) % c.opciones;
    await t.http().post(`${API}/diagnosticos/${id}/respuestas`).set(bearer(token)).send({ itemId: item.itemId, indice }).expect(200);
  }
}

let tokenDocente: string;
let aulaId: string;
const ninos = {} as Record<'mateo' | 'lia', { id: string; token: string }>;
let retoMateo: string;

describe('Preparación', () => {
  it('una docente con un aula, Mateo (9 años) y Lía (6 años) en la tablet del aula', async () => {
    tokenDocente = await docente();
    aulaId = (await t.http().post(`${API}/aulas`).set(bearer(tokenDocente)).send({
      nombre: '3.° B', grado: '3', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body.id;
    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(tokenDocente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    const anio = new Date().getFullYear();
    for (const [clave, alias, edad] of [['mateo', 'Mateo', 9], ['lia', 'Lía', 6]] as const) {
      const m = (await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(tokenDocente)).send({ alias, anioNacimiento: anio - edad, mesNacimiento: 1, avatar: 'zorro' }).expect(201)).body;
      await t.http().post(`${API}/estudiantes/${m.estudianteId}/pin/restablecer`).set(bearer(tokenDocente)).send({ pinNuevo: '4826' }).expect(200);
      const token = (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: m.estudianteId, pin: '4826' }).expect(200)).body.accessToken;
      ninos[clave] = { id: m.estudianteId, token };
    }
    expect(await t.prisma.bancoItemDiagnostico.count()).toBe(80);
  });
});

describe('Reto inicial (RF-034, RF-036, RN-05)', () => {
  it('RN-05: sin el reto inicial, el mapa no se habilita', async () => {
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(mapa.diagnosticoPendiente).toBe(true);
    expect(await t.prisma.progresoMundo.count({ where: { estudianteId: ninos.mateo.id } })).toBe(0);
    const actual = (await t.http().get(`${API}/diagnosticos/actual`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(actual).toEqual({ inicialFinalizado: false, pendiente: { id: null, tipo: 'INICIAL', estado: 'NO_INICIADO', respondidos: 0, total: 15 } });
    await t.http().get(`${API}/diagnosticos/actual`).set(bearer(tokenDocente)).expect(403);
    await t.http().post(`${API}/diagnostico/demo`).set(bearer(ninos.mateo.token)).send({}).expect(404); // el esqueleto de ejemplo ya no existe
  });

  it('empieza el reto: 15 preguntas de su edad, en orden, sin la respuesta correcta', async () => {
    const r = (await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.mateo.token)).expect(201)).body;
    retoMateo = r.id;
    expect(r).toMatchObject({ tipo: 'INICIAL', estado: 'EN_CURSO', respondidos: 0, total: 15 });
    expect((await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.mateo.token)).expect(201)).body.id).toBe(retoMateo); // vuelve a entrar: el mismo
    const { item } = (await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(item).toMatchObject({ numero: 1, total: 15, lectura: { titulo: 'Killa y el cóndor' }, enunciado: '¿Qué comía Killa cada mañana?' });
    expect(item.opciones).toHaveLength(4);
    expect(JSON.stringify(item)).not.toMatch(/indice|correcta|habilidad|dificultad/i);
  });

  it('valida la respuesta: la pregunta en pantalla, una opción que exista', async () => {
    const { item } = (await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.mateo.token))).body;
    const otro = await t.prisma.bancoItemDiagnostico.findFirstOrThrow({ where: { rangoEdad: 'R2', forma: 'A', id: { not: item.itemId } } });
    await t.http().post(`${API}/diagnosticos/${retoMateo}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: otro.id, indice: 0 }).expect(409);
    await t.http().post(`${API}/diagnosticos/${retoMateo}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: item.itemId, indice: 9 }).expect(400);
    await t.http().post(`${API}/diagnosticos/${retoMateo}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: 'no-es-un-id', indice: 0 }).expect(400);
    // El reto de otro niño responde como si no existiera.
    await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.lia.token)).expect(404);
  });

  it('RF-036: pausa a mitad de camino y, al volver, sigue en la pregunta siguiente', async () => {
    for (let i = 0; i < 6; i++) {
      const { item } = (await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.mateo.token))).body;
      const c = await correcta(item.itemId);
      await t.http().post(`${API}/diagnosticos/${retoMateo}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: item.itemId, indice: ['LIT', 'VOC'].includes(c.habilidad) ? c.indice : (c.indice + 1) % c.opciones }).expect(200);
    }
    const pausado = (await t.http().post(`${API}/diagnosticos/${retoMateo}/pausar`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(pausado).toMatchObject({ estado: 'PAUSADO', respondidos: 6 });
    expect(await t.prisma.respuestaDiagnostico.count({ where: { diagnosticoId: retoMateo } })).toBe(6);
    expect((await t.prisma.diagnostico.findUniqueOrThrow({ where: { id: retoMateo } })).pausadoEn).not.toBeNull();
    expect((await t.http().get(`${API}/diagnosticos/actual`).set(bearer(ninos.mateo.token))).body.pendiente).toMatchObject({ id: retoMateo, estado: 'PAUSADO', respondidos: 6 });
    const { item: pendiente } = (await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.mateo.token))).body;
    await t.http().post(`${API}/diagnosticos/${retoMateo}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: pendiente.itemId, indice: 0 }).expect(409);
    expect((await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.mateo.token)).expect(201)).body).toMatchObject({ id: retoMateo, estado: 'EN_CURSO', respondidos: 6 });
    expect((await t.http().get(`${API}/diagnosticos/${retoMateo}/siguiente-item`).set(bearer(ninos.mateo.token))).body.item.numero).toBe(7);
  });

  it('la base no admite dos retos sin terminar para el mismo niño (segunda barrera)', async () => {
    await expect(t.prisma.diagnostico.create({ data: { estudianteId: ninos.mateo.id, tipo: 'REEVALUACION', secuencia: 1, estado: 'NO_INICIADO', rangoEdad: 'R2', totalItems: 15 } })).rejects.toThrow(/Unique constraint|diagnostico_un_pendiente_por_estudiante/);
  });
});

describe('Nivel inicial y posición en el mapa (RF-035, RF-033)', () => {
  it('Mateo acierta en LIT y VOC: nivel por habilidad y empieza en el Detective con el Explorador completado (UAT-01)', async () => {
    await t.http().post(`${API}/diagnosticos/${retoMateo}/finalizar`).set(bearer(ninos.mateo.token)).expect(409); // aún faltan
    await responderTodo(ninos.mateo.token, retoMateo, ['LIT', 'VOC']);
    const resultado = (await t.http().post(`${API}/diagnosticos/${retoMateo}/finalizar`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(resultado).toMatchObject({ tipo: 'INICIAL', aciertos: 6, total: 15 });
    const lit = resultado.habilidades.find((h: { codigo: string }) => h.codigo === 'LIT');
    expect(lit).toMatchObject({ valor: 100, nivel: 'AD', etiquetaNivel: 'Destacado', nivelDeclarado: null });
    expect(resultado.habilidades.find((h: { codigo: string }) => h.codigo === 'INF')).toMatchObject({ valor: 0, nivel: 'C' });

    const fila = await t.prisma.diagnostico.findUniqueOrThrow({ where: { id: retoMateo } });
    expect(fila).toMatchObject({ estado: 'FINALIZADO' });
    expect((fila.resultado as { habilidades: Record<string, { valor: number }> }).habilidades.VOC?.valor).toBe(100);
    const evento = await t.prisma.outboxEvento.findFirstOrThrow({ where: { tipo: 'diagnostico.DiagnosticoFinalizado', agregadoId: retoMateo } });
    expect(evento.payload).toMatchObject({ estudianteId: ninos.mateo.id, maestrias: { LIT: 100, VOC: 100, INF: 0, CRI: 0, ARG: 0 } });
    expect(evento.publicadoEn).not.toBeNull();

    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(mapa.diagnosticoPendiente).toBe(false);
    expect(mapa.mundos.map((m: { estado: string }) => m.estado)).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(await t.http().get(`${API}/diagnosticos/actual`).set(bearer(ninos.mateo.token)).then((r) => r.body)).toEqual({ inicialFinalizado: true, pendiente: null });
    expect((await t.http().get(`${API}/diagnosticos/${retoMateo}/resultado`).set(bearer(ninos.mateo.token)).expect(200)).body).toEqual(resultado);
    await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.mateo.token)).expect(409); // el inicial no se repite
  });

  it('Lía (6 años) tiene 10 preguntas de su edad; sin LIT ni VOC empieza en el Explorador', async () => {
    const { id } = (await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.lia.token)).expect(201)).body;
    expect((await t.http().get(`${API}/diagnosticos/${id}/siguiente-item`).set(bearer(ninos.lia.token))).body.item).toMatchObject({ total: 10, lectura: { titulo: 'Toby en el parque' } });
    await responderTodo(ninos.lia.token, id, ['INF', 'CRI', 'ARG']);
    expect((await t.http().post(`${API}/diagnosticos/${id}/finalizar`).set(bearer(ninos.lia.token)).expect(200)).body).toMatchObject({ aciertos: 6, total: 10 });
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.lia.token)).expect(200)).body;
    expect(mapa.mundos.map((m: { estado: string }) => m.estado)).toEqual(['DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
  });
});

describe('Reevaluación periódica del docente (RF-037)', () => {
  it('la docente la asigna a su aula; otra docente no puede', async () => {
    const otra = await docente();
    await t.http().post(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(otra)).send({}).expect(404);
    await t.http().post(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(ninos.mateo.token)).send({}).expect(403);
    await t.http().post(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(tokenDocente)).send({ estudianteIds: ['no-es-un-id'] }).expect(400);
    const r = (await t.http().post(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(tokenDocente)).send({ estudianteIds: [ninos.mateo.id] }).expect(201)).body;
    expect(r).toEqual({ asignados: 1, omitidos: [] });
    expect(await t.prisma.diagnostico.findFirst({ where: { estudianteId: ninos.mateo.id, tipo: 'REEVALUACION' } })).toMatchObject({ secuencia: 1, estado: 'NO_INICIADO' });
    const otraVez = (await t.http().post(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(tokenDocente)).send({}).expect(201)).body;
    expect(otraVez.omitidos).toEqual([{ estudianteId: ninos.mateo.id, alias: 'Mateo', motivo: 'Ya tiene un reto pendiente' }]);
    expect(otraVez.asignados).toBe(1); // Lía
  });

  it('Mateo la hace con la forma equivalente y la docente compara habilidad por habilidad', async () => {
    const pendiente = (await t.http().get(`${API}/diagnosticos/actual`).set(bearer(ninos.mateo.token))).body.pendiente;
    expect(pendiente).toMatchObject({ tipo: 'REEVALUACION', estado: 'NO_INICIADO', total: 15 });
    const { id } = (await t.http().post(`${API}/diagnosticos`).set(bearer(ninos.mateo.token)).expect(201)).body;
    expect((await t.http().get(`${API}/diagnosticos/${id}/siguiente-item`).set(bearer(ninos.mateo.token))).body.item.lectura.titulo).toBe('El bufeo colorado'); // forma B
    await responderTodo(ninos.mateo.token, id, ['LIT', 'VOC', 'INF']);
    await t.http().post(`${API}/diagnosticos/${id}/finalizar`).set(bearer(ninos.mateo.token)).expect(200);
    // El mapa no cambia: la posición inicial se decide una sola vez.
    expect((await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.mateo.token))).body.mundoActual).toBe(2);

    const resumen = (await t.http().get(`${API}/aulas/${aulaId}/reevaluaciones`).set(bearer(tokenDocente)).expect(200)).body;
    expect(resumen.map((x: { alias: string }) => x.alias)).toEqual(['Lía', 'Mateo']);
    const mateo = resumen.find((x: { alias: string }) => x.alias === 'Mateo');
    expect(mateo.inicial).toEqual({ estado: 'FINALIZADO', valores: { LIT: 100, INF: 0, VOC: 100, CRI: 0, ARG: 0 } });
    expect(mateo.reevaluacion).toMatchObject({ secuencia: 1, estado: 'FINALIZADO', valores: { LIT: 100, INF: 100, VOC: 100 } });
    expect(mateo.cambios).toEqual({ LIT: 0, INF: 100, VOC: 0, CRI: 0, ARG: 0 });
    expect(resumen.find((x: { alias: string }) => x.alias === 'Lía').reevaluacion).toMatchObject({ estado: 'NO_INICIADO', valores: null });
  });
});
