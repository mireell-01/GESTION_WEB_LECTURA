import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CASOS_USO_REPORTING, CasosUsoReporting } from '../../../src/modules/reporting/application/casos-uso-reporting';
import { fechaLocalLima, lunesDeLaSemana } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';
import { API, ayudantesReporting, bearer } from './ayudantes';

/**
 * Nivel 2 — Acompañamiento familiar (RF-068 a RF-070) contra PostgreSQL real: el panel de cada hijo lee
 * las vistas de reportes (su semana, su avance real tras el reto inicial y una lectura, sus habilidades y
 * los consejos para casa con una lectura sugerida); solo de los hijos vinculados (RN-17); el resumen del
 * domingo a las 18:00 sale una vez por familia con su enlace de baja con un clic (también el de RFC 8058).
 */
let t: AppDePrueba;
let casos: CasosUsoReporting;
const { backoffice, adulto, docente, publicarKilla, retoInicial, leerKilla, maestria, crearAula, sesionNino } = ayudantesReporting(() => t);

beforeAll(async () => {
  t = await crearApp();
  casos = t.app.get<CasosUsoReporting>(CASOS_USO_REPORTING);
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

type Cuenta = { email: string; token: string; id: string };
let carmen: Cuenta;
let jose: Cuenta;
let rosa: Cuenta;
let mateo: string;
let lucia: string;
let pedro: string;
let killa: { lecturaId: string; o: string[] };

/** El domingo de esta semana de Lima a las 18:30 (y los siguientes). */
const domingo = (semanasDespues = 0) => {
  const lunes = lunesDeLaSemana(fechaLocalLima(new Date()));
  return new Date(Date.parse(`${lunes}T23:30:00Z`) + (6 + 7 * semanasDespues) * 86_400_000);
};
const panel = (estudianteId: string, token = carmen.token) => t.http().get(`${API}/familia/estudiantes/${estudianteId}/panel`).set(bearer(token));
const correosDe = async (email: string) =>
  ((await t.http().get(`${API}/dev/correos`)).body as { para: string; asunto: string; texto: string; enlace?: string; bajaUrl?: string }[]).filter(
    (c) => c.para === email && c.asunto.startsWith('Resumen semanal: así'),
  );

async function hijo(token: string, alias: string, anio: number) {
  return (await t.http().post(`${API}/estudiantes`).set(bearer(token)).send({ alias, anioNacimiento: anio, mesNacimiento: 3, avatar: 'koala', pin: '2580' }).expect(201)).body.id as string;
}

describe('Preparación', () => {
  it('Mateo lee de verdad en su aula; Carmen lo acompaña por invitación y tiene a Lucía; José tiene a Pedro', async () => {
    killa = await publicarKilla(await backoffice('EDITOR'), await backoffice('REVISOR'));
    rosa = await docente('Rosa Pérez');
    const aula = await crearAula(rosa.token, '4.° A', ['Mateo']);
    mateo = aula.ids['Mateo'] as string;
    const tokenMateo = await sesionNino(rosa.token, aula.aulaId, mateo);
    await retoInicial(tokenMateo, ['LIT', 'VOC']);
    await leerKilla(tokenMateo, killa);

    carmen = await adulto('Carmen Díaz', 'FAMILIAR');
    jose = await adulto('José Ramos', 'FAMILIAR');
    for (const f of [carmen, jose]) {
      await t.http().post(`${API}/consentimientos`).set(bearer(f.token)).send({ otorganteNombre: 'Adulto responsable', aceptaPolitica: true }).expect(201);
    }
    const anio = new Date().getFullYear() - 9;
    lucia = await hijo(carmen.token, 'Lucía', anio);
    pedro = await hijo(jose.token, 'Pedro', anio);
    const { codigo } = (await t.http().post(`${API}/estudiantes/${mateo}/invitaciones-familiar`).set(bearer(rosa.token)).expect(201)).body;
    await t.http().post(`${API}/familia/vincular`).set(bearer(carmen.token)).send({ codigo }).expect(201);
    // Lo que Progreso habría medido a Lucía.
    await maestria(lucia, { LIT: 72, INF: 31, VOC: 48, CRI: 66, ARG: 55 });
    await casos.vistas.refrescar();
  });
});

describe('Panel por hijo (RF-068, RF-069)', () => {
  it('RF-068: el avance real de Mateo, su semana y sus habilidades, aunque lo gestione su docente', async () => {
    const p = (await panel(mateo).expect(200)).body;
    expect(p.estudiante).toMatchObject({ id: mateo, alias: 'Mateo', rangoEdad: 'R2', activo: true, relacion: 'VINCULADO' });
    expect(p.actualizadoEn).not.toBeNull();
    expect(p.semana.actual).toMatchObject({ semana: lunesDeLaSemana(fechaLocalLima(new Date())), lecturas: 1 });
    expect(p.semana.actual.respuestas).toBeGreaterThan(0);
    expect(p.semana.anterior).toMatchObject({ minutos: 0, lecturas: 0, respuestas: 0 });
    // Su reto inicial (bien en literal y vocabulario) lo ubicó en el mundo 2; Killa le dio puntos y "Primera lectura".
    expect(p.avance).toMatchObject({ lecturasTerminadas: 1, mundosCompletados: 1, mundoActual: { numero: 2, nombre: 'Detective' } });
    expect(p.avance.puntos).toBeGreaterThan(0);
    expect(p.avance.insignias).toBeGreaterThanOrEqual(1);
    expect(p.avance.ultimaActividad).not.toBeNull();
    expect(p.habilidades.map((h: { habilidad: string }) => h.habilidad)).toEqual(['LIT', 'INF', 'VOC', 'CRI', 'ARG']);
    expect(p.habito.length).toBeGreaterThanOrEqual(1);
  });

  it('RF-069: por cada habilidad a reforzar, consejos para casa y una lectura de su edad que aún no terminó', async () => {
    const p = (await panel(lucia).expect(200)).body;
    expect(p.estudiante.relacion).toBe('RESPONSABLE');
    expect(p.avance).toMatchObject({ lecturasTerminadas: 0, mundoActual: null, puntos: 0 });
    const reforzar = p.aReforzar as { habilidad: string; valor: number; consejos: string[]; lectura: { id: string; titulo: string } | null }[];
    expect(reforzar.map((r) => `${r.habilidad}:${r.valor}`)).toEqual(['INF:31', 'VOC:48', 'ARG:55']);
    for (const r of reforzar) expect(r.consejos).toHaveLength(2);
    expect(reforzar[0]!.lectura).toEqual({ id: killa.lecturaId, titulo: 'Killa y la llama' });
    expect(reforzar[1]!.lectura).toBeNull(); // ninguna lectura publicada trabaja vocabulario
    // Mateo ya terminó Killa: no se le sugiere de nuevo.
    await maestria(mateo, { INF: 30 });
    await casos.vistas.refrescar();
    expect((await panel(mateo).expect(200)).body.aReforzar[0]).toMatchObject({ habilidad: 'INF', lectura: null });
  });

  it('RN-17: solo los hijos vinculados a la cuenta; para cualquier otro, 404', async () => {
    await panel(lucia, jose.token).expect(404);
    await panel(mateo, jose.token).expect(404);
    await panel('no-es-un-id', jose.token).expect(404);
    await panel(pedro, jose.token).expect(200);
    // Solo familias (la docente tiene su propio panel) y con sesión.
    await panel(mateo, rosa.token).expect(403);
    await t.http().get(`${API}/familia/estudiantes/${mateo}/panel`).expect(401);
  });

  it('RNF-001: el panel responde en menos de 300 ms (y nunca más de 800 ms)', async () => {
    const tiempos: number[] = [];
    for (let i = 0; i < 11; i++) {
      const inicio = performance.now();
      await panel(mateo).expect(200);
      tiempos.push(performance.now() - inicio);
    }
    const ordenados = tiempos.slice(1).sort((a, b) => a - b);
    expect(ordenados[5]).toBeLessThan(300);
    expect(ordenados.at(-1)).toBeLessThan(800);
  });
});

describe('Preferencias y resumen semanal (RF-070)', () => {
  it('cada familia lo recibe salvo que se dé de baja; lo cambia desde su panel', async () => {
    expect((await t.http().get(`${API}/familia/preferencias-notificacion`).set(bearer(jose.token)).expect(200)).body).toEqual({ resumenSemanal: true });
    await t.http().patch(`${API}/familia/preferencias-notificacion`).set(bearer(jose.token)).send({ resumenSemanal: 'no' }).expect(400);
    await t.http().patch(`${API}/familia/preferencias-notificacion`).set(bearer(jose.token)).send({ resumenSemanal: false }).expect(200);
    expect((await t.http().get(`${API}/familia/preferencias-notificacion`).set(bearer(jose.token)).expect(200)).body).toEqual({ resumenSemanal: false });
    await t.http().patch(`${API}/familia/preferencias-notificacion`).set(bearer(jose.token)).send({ resumenSemanal: true }).expect(200);
  });

  it('el domingo a las 18:00 de Lima sale una vez por familia con cada hijo, su semana y un consejo', async () => {
    expect(await casos.resumenFamiliar.enviarPendientes(new Date(domingo().getTime() - 60 * 60_000))).toBe(2); // 17:30: la semana anterior
    expect(await casos.resumenFamiliar.enviarPendientes(domingo())).toBe(2);
    expect(await casos.resumenFamiliar.enviarPendientes(domingo())).toBe(0);
    const [ultimo] = await correosDe(carmen.email);
    expect(ultimo!.asunto).toBe('Resumen semanal: así leyeron Lucía y Mateo');
    expect(ultimo!.texto).toContain('Mateo\n• Esta semana:');
    expect(ultimo!.texto).toContain('1 lectura terminada');
    expect(ultimo!.texto).toContain('• Va en el mundo 2 · Detective; lleva 1 lectura terminada');
    expect(ultimo!.texto).toContain('Lucía\n• Esta semana no leyó en LectoAventura.');
    expect(ultimo!.texto).toContain('• Para acompañar en casa inferencias: ');
    expect(ultimo!.enlace).toBe('http://localhost:3002/familia');
    expect(ultimo!.bajaUrl).toMatch(/^http:\/\/localhost:3002\/api\/v1\/familia\/preferencias-notificacion\/baja\?token=/);
    expect(await t.prisma.resumenFamiliarEnviado.count()).toBe(4);
  });

  it('baja con un clic desde el enlace del correo, sin sesión; deshacerla; enlaces alterados no sirven', async () => {
    const [ultimo] = await correosDe(carmen.email);
    const token = decodeURIComponent(/resumen-familiar\/baja\?token=(\S+)/.exec(ultimo!.texto)![1]!);
    expect((await t.http().post(`${API}/familia/preferencias-notificacion/baja`).send({ token }).expect(200)).body).toEqual({ resumenSemanal: false });
    expect((await t.http().get(`${API}/familia/preferencias-notificacion`).set(bearer(carmen.token)).expect(200)).body).toEqual({ resumenSemanal: false });
    expect((await t.http().post(`${API}/familia/preferencias-notificacion/alta`).send({ token }).expect(200)).body).toEqual({ resumenSemanal: true });
    // RFC 8058: el programa de correo hace un POST al enlace con "List-Unsubscribe=One-Click".
    const ruta = new URL(ultimo!.bajaUrl!).pathname.replace(API, '') + new URL(ultimo!.bajaUrl!).search;
    await t.http().post(`${API}${ruta}`).type('form').send('List-Unsubscribe=One-Click').expect(200);
    expect((await t.http().get(`${API}/familia/preferencias-notificacion`).set(bearer(carmen.token)).expect(200)).body).toEqual({ resumenSemanal: false });
    for (const malo of [`${token.slice(0, -2)}xx`, '', 'cualquier-cosa']) {
      await t.http().post(`${API}/familia/preferencias-notificacion/baja`).send({ token: malo }).expect(400);
    }
    await t.http().post(`${API}/familia/preferencias-notificacion/baja`).send({ token, extra: 1 }).expect(400);
  });

  it('dada de baja, el domingo siguiente no le llega; a José, sí', async () => {
    expect(await casos.resumenFamiliar.enviarPendientes(domingo(1))).toBe(1);
    expect(await correosDe(carmen.email)).toHaveLength(2);
    expect(await correosDe(jose.email)).toHaveLength(3);
  });

  it('solo desarrollo: los trabajos de reportes se pueden correr como si fuera otro momento; en producción no existe', async () => {
    const r = (await t.http().post(`${API}/dev/reportes/ejecutar`).send({ ahora: domingo(2).toISOString() }).expect(200)).body;
    expect(r).toEqual({ docentes: expect.any(Number), familias: 1 });
    await t.http().post(`${API}/dev/reportes/ejecutar`).send({ ahora: 'ayer' }).expect(400);
    const entorno = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      await t.http().post(`${API}/dev/reportes/ejecutar`).send({}).expect(404);
    } finally {
      process.env['NODE_ENV'] = entorno;
    }
  });
});
