import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CASOS_USO_ASISTENTE, CasosUsoAsistente } from '../../../src/modules/asistente/application/casos-uso-asistente';
import { MENSAJE_CIERRE } from '../../../src/modules/asistente/domain/services/mediacion-socratica';
import { API, ayudantesReporting, bearer } from '../reporting/ayudantes';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Asistente de lectura (RF-072 a RF-075) contra PostgreSQL real: lo activan la familia que creó
 * el perfil o la docente de su aula (RN-17); el niño conversa durante su lectura por un flujo de eventos
 * (SSE) que empieza en menos de 3 s (RNF-007); nunca recibe la clave; lo guardado no tiene datos
 * personales (RN-16) y se borra a los 30 días; hasta 10 intercambios aunque lleguen a la vez (RF-074); y la
 * docente recibe un borrador de comentario para una respuesta abierta de su aula (RF-075).
 */
let t: AppDePrueba;
let casos: CasosUsoAsistente;
const { backoffice, adulto, docente, publicarKilla, crearAula, sesionNino } = ayudantesReporting(() => t);

beforeAll(async () => {
  t = await crearApp();
  casos = t.app.get<CasosUsoAsistente>(CASOS_USO_ASISTENTE);
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

type Cuenta = { email: string; token: string; id: string };
type Evento = { tipo: 'texto'; texto: string } | { tipo: 'fin'; restantes: number; filtrado: boolean; cerrada: boolean };

let killa: { lecturaId: string; o: string[] };
let rosa: Cuenta;
let otraDocente: Cuenta;
let carmen: Cuenta;
let jose: Cuenta;
let aulaId: string;
let mateo: string;
let ana: string;
let lucia: string;
let tokenMateo: string;
let tokenAna: string;
let tokenLucia: string;
let sesionMateo: string;
let sesionAna: string;

/** Lee el cuerpo SSE completo como texto. */
const comoTexto = (res: NodeJS.ReadableStream, listo: (err: Error | null, cuerpo: string) => void) => {
  let cuerpo = '';
  res.setEncoding('utf8');
  res.on('data', (c: string) => (cuerpo += c));
  res.on('end', () => listo(null, cuerpo));
};

/** Un mensaje al asistente: devuelve los eventos, el texto armado y cuánto tardó. */
async function turno(sesionId: string, token: string, cuerpo: object, estado = 200) {
  const inicio = performance.now();
  const res = await t.http().post(`${API}/sesiones-lectura/${sesionId}/asistente/turnos`).set(bearer(token)).send(cuerpo).buffer(true).parse(comoTexto).expect(estado);
  const ms = performance.now() - inicio;
  if (estado !== 200) return { res, eventos: [] as Evento[], texto: '', fin: null, ms };
  const eventos = (res.body as string)
    .split('\n\n')
    .filter((b) => b.startsWith('data: '))
    .map((b) => JSON.parse(b.slice(6)) as Evento);
  const texto = eventos.flatMap((e) => (e.tipo === 'texto' ? [e.texto] : [])).join('');
  return { res, eventos, texto, fin: eventos.at(-1) as Extract<Evento, { tipo: 'fin' }>, ms };
}

const estado = (sesionId: string, token: string, codigo = 200) => t.http().get(`${API}/sesiones-lectura/${sesionId}/asistente`).set(bearer(token)).expect(codigo);

async function hijo(token: string, alias: string) {
  return (await t.http().post(`${API}/estudiantes`).set(bearer(token)).send({ alias, anioNacimiento: new Date().getFullYear() - 9, mesNacimiento: 3, avatar: 'koala', pin: '2580' }).expect(201)).body.id as string;
}

/** Empieza Killa y predice: queda en la inferencia (con su pista oficial disponible). */
async function hastaLaInferencia(token: string) {
  const id = (await t.http().post(`${API}/sesiones-lectura`).set(bearer(token)).send({ lecturaId: killa.lecturaId }).expect(201)).body.id as string;
  await t.http().put(`${API}/sesiones-lectura/${id}/prediccion`).set(bearer(token)).send({ texto: 'Creo que la llama se enfermará' }).expect(200);
  return id;
}

/** Sigue la lectura ya empezada hasta el final: acierta las cerradas y escribe su opinión. */
async function terminarKilla(token: string, id: string) {
  for (let paso = 0; paso < 10; paso++) {
    const p = (await t.http().get(`${API}/sesiones-lectura/${id}`).set(bearer(token)).expect(200)).body.pregunta as { itemId: string; enunciado: string; opciones: string[] } | null;
    if (!p) break;
    const cuerpo = p.enunciado.startsWith('¿Por qué')
      ? { indice: p.opciones.indexOf('Le dolía algo') }
      : p.enunciado.startsWith('Toca')
        ? { oraciones: [killa.o[3]] }
        : { texto: 'Sí, porque así encontró la espina y lo curó' };
    await t.http().post(`${API}/sesiones-lectura/${id}/respuestas`).set(bearer(token)).send({ itemId: p.itemId, idempotencyKey: crypto.randomUUID(), ...cuerpo }).expect(200);
  }
  await t.http().post(`${API}/sesiones-lectura/${id}/finalizar`).set(bearer(token)).send({ reflexion: 'Era una espina' }).expect(200);
}

describe('Preparación', () => {
  it('Rosa tiene a Mateo y Ana en su aula; Carmen creó a Lucía y acompaña a Mateo por invitación; José es otra familia', async () => {
    killa = await publicarKilla(await backoffice('EDITOR'), await backoffice('REVISOR'));
    rosa = await docente('Rosa Pérez');
    otraDocente = await docente('Elena Torres');
    const aula = await crearAula(rosa.token, '4.° A', ['Mateo', 'Ana']);
    aulaId = aula.aulaId;
    mateo = aula.ids['Mateo'] as string;
    ana = aula.ids['Ana'] as string;
    tokenMateo = await sesionNino(rosa.token, aulaId, mateo);
    tokenAna = await sesionNino(rosa.token, aulaId, ana);

    carmen = await adulto('Carmen Díaz', 'FAMILIAR');
    jose = await adulto('José Ramos', 'FAMILIAR');
    for (const f of [carmen, jose]) {
      await t.http().post(`${API}/consentimientos`).set(bearer(f.token)).send({ otorganteNombre: 'Adulto responsable', aceptaPolitica: true }).expect(201);
    }
    lucia = await hijo(carmen.token, 'Lucía');
    const { codigo } = (await t.http().post(`${API}/estudiantes/${mateo}/invitaciones-familiar`).set(bearer(rosa.token)).expect(201)).body;
    await t.http().post(`${API}/familia/vincular`).set(bearer(carmen.token)).send({ codigo }).expect(201);
    const { tokenDispositivo } = (await t.http().post(`${API}/familia/dispositivos`).set(bearer(carmen.token)).send({ nombre: 'Tablet de casa' }).expect(201)).body;
    tokenLucia = (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo, perfilId: lucia, pin: '2580' }).expect(200)).body.accessToken;
  });
});

describe('RF-072: activación por la familia o la docente (RN-17)', () => {
  const deFamilia = (id: string) => `${API}/familia/estudiantes/${id}/asistente`;

  it('la familia que creó el perfil lo activa; queda registrado quién y cuándo', async () => {
    expect((await t.http().get(deFamilia(lucia)).set(bearer(carmen.token)).expect(200)).body).toEqual({ estudianteId: lucia, activo: false });
    expect((await t.http().put(deFamilia(lucia)).set(bearer(carmen.token)).send({ activo: true }).expect(200)).body).toEqual({ estudianteId: lucia, activo: true });
    const fila = await t.prisma.activacionAsistente.findUniqueOrThrow({ where: { estudianteId: lucia } });
    expect(fila).toMatchObject({ activo: true, cambiadoPor: carmen.id, rol: 'FAMILIAR' });
  });

  it('otra familia, la que acompaña por invitación o una docente no pueden', async () => {
    await t.http().get(deFamilia(lucia)).set(bearer(jose.token)).expect(404);
    await t.http().put(deFamilia(lucia)).set(bearer(jose.token)).send({ activo: false }).expect(404);
    // Carmen acompaña a Mateo por invitación: ahí decide su docente.
    await t.http().put(deFamilia(mateo)).set(bearer(carmen.token)).send({ activo: true }).expect(404);
    await t.http().get(deFamilia(lucia)).set(bearer(rosa.token)).expect(403);
    await t.http().put(deFamilia(lucia)).set(bearer(carmen.token)).send({ activo: 'sí' }).expect(400);
    await t.http().put(deFamilia(lucia)).set(bearer(carmen.token)).send({ activo: true, rol: 'DOCENTE' }).expect(400);
  });

  it('la docente lo activa para su aula o para algunos (ordenados por nombre)', async () => {
    const url = `${API}/aulas/${aulaId}/asistente`;
    expect((await t.http().get(url).set(bearer(rosa.token)).expect(200)).body.estudiantes.map((e: { alias: string; activo: boolean }) => [e.alias, e.activo])).toEqual([
      ['Ana', false],
      ['Mateo', false],
    ]);
    const todos = (await t.http().put(url).set(bearer(rosa.token)).send({ activo: true }).expect(200)).body;
    expect(todos.estudiantes.every((e: { activo: boolean }) => e.activo)).toBe(true);
    const sinAna = (await t.http().put(url).set(bearer(rosa.token)).send({ activo: false, estudianteIds: [ana] }).expect(200)).body;
    expect(sinAna.estudiantes.map((e: { alias: string; activo: boolean }) => [e.alias, e.activo])).toEqual([
      ['Ana', false],
      ['Mateo', true],
    ]);
    expect(await t.prisma.activacionAsistente.findUniqueOrThrow({ where: { estudianteId: mateo } })).toMatchObject({ activo: true, cambiadoPor: rosa.id, rol: 'DOCENTE' });
  });

  it('RN-17: otra docente, un estudiante ajeno o datos inválidos', async () => {
    const url = `${API}/aulas/${aulaId}/asistente`;
    await t.http().get(url).set(bearer(otraDocente.token)).expect(404);
    await t.http().put(url).set(bearer(otraDocente.token)).send({ activo: true }).expect(404);
    await t.http().put(url).set(bearer(rosa.token)).send({ activo: true, estudianteIds: [lucia] }).expect(404);
    await t.http().put(url).set(bearer(rosa.token)).send({ activo: true, estudianteIds: ['no-es-uuid'] }).expect(400);
    await t.http().get(url).set(bearer(carmen.token)).expect(403);
    expect(await t.prisma.activacionAsistente.findUnique({ where: { estudianteId: lucia } })).toMatchObject({ rol: 'FAMILIAR' });
  });
});

describe('RF-072 a RF-074: el niño conversa durante su lectura', () => {
  it('RNF-007: responde por un flujo de eventos en menos de 3 s, con una guía y sin la clave', async () => {
    sesionMateo = await hastaLaInferencia(tokenMateo);
    expect((await estado(sesionMateo, tokenMateo)).body).toEqual({ disponible: true, intercambios: 0, restantes: 10, turnos: [] });

    const r = await turno(sesionMateo, tokenMateo, { atajo: 'NO_ENTIENDO' });
    expect(r.res.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(r.res.headers['cache-control']).toMatch(/no-cache/);
    expect(r.ms).toBeLessThan(3000);
    expect(r.eventos.filter((e) => e.tipo === 'texto').length).toBeGreaterThan(1);
    expect(r.texto).toMatch(/^Leamos la pregunta despacio: «¿Por qué Pancho no quiso comer\?»/);
    expect(r.fin).toEqual({ tipo: 'fin', restantes: 9, filtrado: false, cerrada: false });

    const pide = await turno(sesionMateo, tokenMateo, { mensaje: 'dime cuál es la respuesta correcta' });
    expect(pide.texto).toMatch(/^No te voy a decir la respuesta/);
    expect(pide.texto).toContain('«Pedir una pista»');
    expect(pide.texto).not.toMatch(/Le dolía algo|espina/i);
  });

  it('RN-16: guarda el mensaje sin datos personales y lo conversado sigue ahí al volver', async () => {
    const r = await turno(sesionMateo, tokenMateo, { mensaje: 'Me llamo Mateo Quispe, mi celular es 987654321' });
    expect(r.texto).toMatch(/^Aquí no compartas datos personales/);
    const conversacion = await t.prisma.conversacion.findUniqueOrThrow({ where: { sesionLecturaId: sesionMateo }, include: { turnos: { orderBy: { orden: 'asc' } } } });
    expect(conversacion).toMatchObject({ estudianteId: mateo, intercambios: 3 });
    expect(conversacion.expiraEn.getTime() - conversacion.iniciadaEn.getTime()).toBe(30 * 86_400_000);
    expect(conversacion.turnos[4]).toMatchObject({ orden: 5, emisor: 'ESTUDIANTE', texto: 'Me llamo [nombre], mi celular es [número]', filtrado: true });
    expect(JSON.stringify(conversacion.turnos)).not.toMatch(/Quispe|987654321/);

    const e = (await estado(sesionMateo, tokenMateo)).body;
    expect(e).toMatchObject({ disponible: true, intercambios: 3, restantes: 7 });
    expect(e.turnos.map((x: { emisor: string }) => x.emisor)).toEqual(['ESTUDIANTE', 'ASISTENTE', 'ESTUDIANTE', 'ASISTENTE', 'ESTUDIANTE', 'ASISTENTE']);
  });

  it('valida lo que llega: sin mensaje, muy largo, atajo desconocido o campos de más', async () => {
    await turno(sesionMateo, tokenMateo, {}, 400);
    await turno(sesionMateo, tokenMateo, { mensaje: '    ' }, 400);
    await turno(sesionMateo, tokenMateo, { mensaje: 'a'.repeat(301) }, 400);
    await turno(sesionMateo, tokenMateo, { atajo: 'DAME_LA_RESPUESTA' }, 400);
    await turno(sesionMateo, tokenMateo, { mensaje: 'hola', claves: true }, 400);
    expect((await estado(sesionMateo, tokenMateo)).body.intercambios).toBe(3);
  });

  it('RN-17: la sesión de otro niño no existe; sin activar no conversa; un adulto no entra', async () => {
    await estado(sesionMateo, tokenAna, 404);
    await turno(sesionMateo, tokenAna, { mensaje: 'hola' }, 404);
    sesionAna = await hastaLaInferencia(tokenAna);
    expect((await estado(sesionAna, tokenAna)).body).toMatchObject({ disponible: false, restantes: 10 });
    const r = await turno(sesionAna, tokenAna, { mensaje: 'hola' }, 403);
    expect(r.res.body).toContain('El asistente de lectura no está activado para ti');
    await turno(sesionMateo, rosa.token, { mensaje: 'hola' }, 403);
    expect(await t.prisma.conversacion.count({ where: { sesionLecturaId: sesionAna } })).toBe(0);
  });

  it('RF-074: muchos mensajes a la vez nunca pasan de 10; el siguiente recibe un cierre amable', async () => {
    const r = await Promise.all(Array.from({ length: 9 }, (_, i) => turno(sesionMateo, tokenMateo, { mensaje: `pregunta ${i + 1}` }, 200)));
    const cierres = r.filter((x) => x.fin.cerrada && x.texto === MENSAJE_CIERRE).length;
    expect(r.filter((x) => x.texto !== MENSAJE_CIERRE)).toHaveLength(7);
    expect(cierres).toBe(2);
    const c = await t.prisma.conversacion.findUniqueOrThrow({ where: { sesionLecturaId: sesionMateo }, include: { turnos: true } });
    expect(c.intercambios).toBe(10);
    expect(c.cerradaEn).not.toBeNull();
    expect(c.turnos.map((x) => x.orden).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));

    const otra = await turno(sesionMateo, tokenMateo, { atajo: 'DONDE_BUSCO' });
    expect(otra.texto).toBe(MENSAJE_CIERRE);
    expect(otra.fin).toEqual({ tipo: 'fin', restantes: 0, filtrado: false, cerrada: true });
    expect(await t.prisma.turno.count({ where: { conversacionId: c.id } })).toBe(20);
  });

  it('el hijo de la familia también conversa (lo activó Carmen)', async () => {
    const sesionLucia = await hastaLaInferencia(tokenLucia);
    const r = await turno(sesionLucia, tokenLucia, { atajo: 'COMO_EMPIEZO' });
    expect(r.fin).toMatchObject({ restantes: 9, cerrada: false });
  });
});

describe('RF-075: borrador de retroalimentación para la docente', () => {
  let respuestaAna: string;

  it('propone un comentario para la respuesta abierta de su estudiante; no guarda nada', async () => {
    await terminarKilla(tokenAna, sesionAna);
    const [pendiente] = (await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(rosa.token)).expect(200)).body as { respuestaId: string; estudiante: { id: string } }[];
    expect(pendiente!.estudiante.id).toBe(ana);
    respuestaAna = pendiente!.respuestaId;
    const res = await t.http().get(`${API}/respuestas/${respuestaAna}/borrador-retroalimentacion`).set(bearer(rosa.token)).expect(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.body).toEqual({
      respuestaId: respuestaAna,
      borrador: 'Me gusta que expliques por qué lo piensas. Busca en el texto una parte que respalde tu idea. ¿Qué otra razón podrías dar?',
      criterios: { palabras: 9, suficiente: true, daRazones: true, usaElTexto: false },
    });
    const sigue = (await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(rosa.token)).expect(200)).body as { valoracion: unknown }[];
    expect(sigue[0]!.valoracion).toBeNull();
  });

  it('RN-17: otra docente, una familia, una respuesta cerrada o inexistente', async () => {
    await t.http().get(`${API}/respuestas/${respuestaAna}/borrador-retroalimentacion`).set(bearer(otraDocente.token)).expect(404);
    await t.http().get(`${API}/respuestas/${respuestaAna}/borrador-retroalimentacion`).set(bearer(carmen.token)).expect(403);
    const cerrada = await t.prisma.respuesta.findFirstOrThrow({ where: { sesion: { estudianteId: ana }, esCorrecta: true } });
    await t.http().get(`${API}/respuestas/${cerrada.id}/borrador-retroalimentacion`).set(bearer(rosa.token)).expect(404);
    await t.http().get(`${API}/respuestas/0192f000-0000-7000-8000-000000000000/borrador-retroalimentacion`).set(bearer(rosa.token)).expect(404);
  });
});

describe('Retención (SRS §7, ADR-008)', () => {
  it('a los 30 días se borran las conversaciones con sus turnos', async () => {
    expect(await t.prisma.conversacion.count()).toBe(2);
    expect(await casos.retencion.borrarVencidas(new Date(Date.now() + 29 * 86_400_000))).toBe(0);
    expect(await casos.retencion.borrarVencidas(new Date(Date.now() + 31 * 86_400_000))).toBe(2);
    expect(await t.prisma.conversacion.count()).toBe(0);
    expect(await t.prisma.turno.count()).toBe(0);
  });
});
