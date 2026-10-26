import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { EscuelaFacade } from '../../../src/modules/escuela/public-api';
import { IamFacade } from '../../../src/modules/iam/public-api';
import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { CASOS_USO_REPORTING, CasosUsoReporting } from '../../../src/modules/reporting/application/casos-uso-reporting';
import { ResumenSemanalUseCase } from '../../../src/modules/reporting/application/use-cases/resumen-semanal.use-case';
import { AulasDocenteEscuela, NotificadorDocenteIam } from '../../../src/modules/reporting/infrastructure/anticorrupcion';
import { PrismaReportesRepository } from '../../../src/modules/reporting/infrastructure/persistence/prisma-reportes-repository';
import { fechaLocalLima, lunesDeLaSemana, nivelDeclarado, uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Seguimiento docente (RF-063 a RF-067) contra PostgreSQL real: el panel lee las vistas de
 * reportes refrescadas (mapa de calor con el nivel CNEB, grupo, alertas, resumen de la semana y refuerzo
 * para una dificultad del 40 % del aula, asignable con el endpoint de asignaciones); el detalle muestra
 * las evidencias y pistas de una lectura real; el reporte sale en CSV y PDF; el resumen semanal se envía
 * una vez; RN-17; y el panel de un aula de 40 estudiantes responde en menos de 1,5 s (RNF-003).
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';
const TEXTO = 'Killa vivía en Puno. Cada mañana cuidaba a su llama Pancho.\nUn día Pancho no quiso comer. Killa vio que tenía una espina en la pata.\nCon cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.';
const HABILIDADES = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'] as const;

let t: AppDePrueba;
let casos: CasosUsoReporting;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const haceDias = (dias: number) => new Date(Date.now() - dias * 86_400_000);

beforeAll(async () => {
  t = await crearApp();
  casos = t.app.get<CasosUsoReporting>(CASOS_USO_REPORTING);
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

async function backoffice(rol: 'EDITOR' | 'REVISOR') {
  const email = `${rol.toLowerCase()}.${uuidV7().slice(-6)}@lectoaventura.test`;
  const secreto = authenticator.generateSecret();
  const cuenta = await t.prisma.cuenta.create({ data: { id: uuidV7(), nombre: `${rol} Prueba`, email, hashContrasena: await new Argon2HashService().hash(CONTRASENA), rol, estado: 'ACTIVA' } });
  await t.prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
  return (await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA, codigoMfa: authenticator.generate(secreto) }).expect(200)).body.accessToken as string;
}

async function docente(nombre: string) {
  const email = `docente.${uuidV7().slice(-6)}@lectoaventura.test`;
  await t.http().post(`${API}/auth/registro`).send({ nombre, email, contrasena: CONTRASENA, rol: 'DOCENTE' }).expect(201);
  const enlace = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  const token = (await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken as string;
  return { email, token, id: (await t.prisma.cuenta.findUniqueOrThrow({ where: { email } })).id };
}

const pista = (nivel: string, texto: string) => ({ nivel, texto });

/** "Killa y la llama" publicada por el flujo real: inferencia con pistas, evidencia y una abierta. */
async function publicarKilla(editora: string, revisora: string) {
  const { lecturaId, oraciones } = (
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora)).send({
      metadatos: { titulo: 'Killa y la llama', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF', 'ARG'], licencia: 'CC BY 4.0' },
      texto: TEXTO,
    }).expect(201)
  ).body as { lecturaId: string; oraciones: { id: string }[] };
  const o = oraciones.map((x) => x.id);
  const actividades = [
    {
      momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: o[2],
      items: [{ habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1, explicacionModelada: 'Tenía una espina.', pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.'), pista('P2', 'Mira el segundo párrafo.')] }],
    },
    {
      momento: 'DURANTE', tipo: 'EVIDENCIA', oracionAnclajeId: o[3],
      items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Toca la oración que dice qué tenía Pancho.', clavesEvidencia: [o[3]], explicacionModelada: 'La oración de la espina.', pistas: [pista('P1', 'Busca en el segundo párrafo.')] }],
    },
    { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'ESCRITURA', enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', explicacionModelada: 'Sí: así encontró la espina.' }] },
  ];
  await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora)).send({ actividades }).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora)).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisora)).expect(200);
  return { lecturaId, o };
}

/** El reto inicial por la API, acertando solo en las habilidades indicadas (Módulo 5). */
async function retoInicial(token: string, acertar: string[]) {
  const { id } = (await t.http().post(`${API}/diagnosticos`).set(bearer(token)).expect(201)).body;
  for (;;) {
    const { item } = (await t.http().get(`${API}/diagnosticos/${id}/siguiente-item`).set(bearer(token)).expect(200)).body;
    if (!item) break;
    const fila = await t.prisma.bancoItemDiagnostico.findUniqueOrThrow({ where: { id: item.itemId } });
    const correcta = (fila.respuestaCorrecta as { indice: number }).indice;
    const indice = acertar.includes(fila.habilidad) ? correcta : (correcta + 1) % (fila.contenido as { opciones: string[] }).opciones.length;
    await t.http().post(`${API}/diagnosticos/${id}/respuestas`).set(bearer(token)).send({ itemId: item.itemId, indice }).expect(200);
  }
  await t.http().post(`${API}/diagnosticos/${id}/finalizar`).set(bearer(token)).expect(200);
}

/** Lee Killa por la API: se equivoca una vez en la inferencia (ve la pista P1), toca la evidencia y escribe. */
async function leerKilla(token: string, killa: { lecturaId: string; o: string[] }) {
  const id = (await t.http().post(`${API}/sesiones-lectura`).set(bearer(token)).send({ lecturaId: killa.lecturaId }).expect(201)).body.id as string;
  await t.http().put(`${API}/sesiones-lectura/${id}/prediccion`).set(bearer(token)).send({ texto: 'Creo que la llama se enfermará' }).expect(200);
  let primera = true;
  for (let paso = 0; paso < 10; paso++) {
    const p = (await t.http().get(`${API}/sesiones-lectura/${id}`).set(bearer(token)).expect(200)).body.pregunta as { itemId: string; enunciado: string; opciones: string[] } | null;
    if (!p) break;
    let cuerpo: Record<string, unknown>;
    if (p.enunciado.startsWith('¿Por qué')) {
      cuerpo = { indice: p.opciones.indexOf(primera ? 'Estaba feliz' : 'Le dolía algo') };
      primera = false;
    } else if (p.enunciado.startsWith('Toca')) cuerpo = { oraciones: [killa.o[3]] };
    else cuerpo = { texto: 'Sí, porque así encontró la espina y lo curó' };
    await t.http().post(`${API}/sesiones-lectura/${id}/respuestas`).set(bearer(token)).send({ itemId: p.itemId, idempotencyKey: uuidV7(), ...cuerpo }).expect(200);
  }
  await t.http().post(`${API}/sesiones-lectura/${id}/finalizar`).set(bearer(token)).send({ reflexion: 'Era una espina' }).expect(200);
  return id;
}

/** Maestría de un estudiante en las 5 habilidades (lo que calcularía Progreso con sus lecturas). */
async function maestria(estudianteId: string, valores: Partial<Record<(typeof HABILIDADES)[number], number>>, items = 6) {
  for (const habilidad of HABILIDADES) {
    const valor = valores[habilidad] ?? 70;
    await t.prisma.maestriaHabilidad.upsert({
      where: { estudianteId_habilidad: { estudianteId, habilidad } },
      create: { estudianteId, habilidad, valor, itemsContados: items, actualizadoEn: new Date() },
      update: { valor, itemsContados: items },
    });
  }
}

async function crearAula(token: string, nombre: string, ninos: string[]) {
  const aulaId = (await t.http().post(`${API}/aulas`).set(bearer(token)).send({
    nombre, grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
  }).expect(201)).body.id as string;
  const anio = new Date().getFullYear() - 9;
  const csv = ninos.map((alias) => `${alias},${anio},1,zorro`).join('\n');
  const { matriculados } = (await t.http().post(`${API}/aulas/${aulaId}/matriculas/importacion`).set(bearer(token)).send({ csv }).expect(201)).body as { matriculados: { estudianteId: string; alias: string }[] };
  return { aulaId, ids: Object.fromEntries(matriculados.map((m) => [m.alias, m.estudianteId])) as Record<string, string> };
}

let rosa: { email: string; token: string; id: string };
let otra: { email: string; token: string; id: string };
let aula: { aulaId: string; ids: Record<string, string> };
let aulaOtra: { aulaId: string; ids: Record<string, string> };
let killa: { lecturaId: string; o: string[] };
let tokenMateo: string;

const panel = (aulaId = aula.aulaId, token = rosa.token) => t.http().get(`${API}/aulas/${aulaId}/panel`).set(bearer(token));
const estudiante = (v: { estudiantes: { alias: string }[] }, alias: string) => v.estudiantes.find((e) => e.alias === alias) as unknown as Record<string, unknown> & { celdas: { habilidad: string; nivel: string | null; valor: number | null }[]; riesgo: { motivos: string[]; diasSinActividad: number | null } };

describe('Preparación', () => {
  it('una lectura publicada, la docente Rosa con 5 estudiantes de 9 años y otra docente con su aula', async () => {
    const editora = await backoffice('EDITOR');
    killa = await publicarKilla(editora, await backoffice('REVISOR'));
    rosa = await docente('Rosa Pérez');
    otra = await docente('Elena Quispe');
    aula = await crearAula(rosa.token, '4.° A', ['Mateo', 'Sofía', 'Teo', 'Ana', 'Luis']);
    aulaOtra = await crearAula(otra.token, '4.° B', ['Iris']);
    const tablet = (await t.http().post(`${API}/aulas/${aula.aulaId}/dispositivos`).set(bearer(rosa.token)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    await t.http().post(`${API}/estudiantes/${aula.ids['Mateo']}/pin/restablecer`).set(bearer(rosa.token)).send({ pinNuevo: '4826' }).expect(200);
    tokenMateo = (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: aula.ids['Mateo'], pin: '4826' }).expect(200)).body.accessToken;

    // Mateo: reto inicial real (bien en LIT y VOC) y dos lecturas reales con una pista y su evidencia.
    await retoInicial(tokenMateo, ['LIT', 'VOC']);
    await leerKilla(tokenMateo, killa);
    await leerKilla(tokenMateo, killa);
    // Lo que Progreso habría medido a los demás: Sofía con INF y ARG en inicio, Teo con INF en inicio, Ana destacada.
    await maestria(aula.ids['Sofía'] as string, { INF: 20, ARG: 30 });
    await maestria(aula.ids['Teo'] as string, { INF: 25 });
    await maestria(aula.ids['Ana'] as string, { INF: 90, LIT: 88 }, 8);
    await maestria(aulaOtra.ids['Iris'] as string, { INF: 10, CRI: 10 });
    await casos.vistas.refrescar();
  });
});

describe('Panel del aula (RF-063, RF-065, RF-066)', () => {
  it('RF-063: mapa de calor estudiantes × habilidades con el nivel CNEB declarado (RN-08)', async () => {
    const v = (await panel().expect(200)).body;
    expect(v.aula).toMatchObject({ id: aula.aulaId, nombre: '4.° A', estado: 'ACTIVA' });
    expect(v.totalEstudiantes).toBe(5);
    expect(new Date(v.actualizadoEn).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(v.estudiantes.map((e: { alias: string }) => e.alias)).toEqual(['Ana', 'Luis', 'Mateo', 'Sofía', 'Teo']);
    expect(estudiante(v, 'Sofía').celdas.map((c) => `${c.habilidad}:${c.nivel}:${c.valor}`)).toEqual(['LIT:A:70', 'INF:C:20', 'VOC:A:70', 'CRI:A:70', 'ARG:C:30']);
    expect(estudiante(v, 'Ana').celdas.find((c) => c.habilidad === 'INF')).toMatchObject({ nivel: 'AD', valor: 90 });
    // Luis aún no tiene nada medido; Mateo, lo que midió Progreso con su reto y sus lecturas (RN-08).
    expect(estudiante(v, 'Luis').celdas.every((c) => c.valor === null && c.nivel === null)).toBe(true);
    const deMateo = await t.prisma.maestriaHabilidad.findMany({ where: { estudianteId: aula.ids['Mateo'] } });
    const nivelMateo = (h: string) => { const f = deMateo.find((x) => x.habilidad === h)!; return nivelDeclarado(Number(f.valor), f.itemsContados); };
    expect(estudiante(v, 'Mateo').celdas.map((c) => `${c.habilidad}:${c.nivel}`)).toEqual(HABILIDADES.map((h) => `${h}:${nivelMateo(h)}`));
    // El grupo, de la vista mv_desempeno_aula: Sofía y Teo en C, Ana en AD y Mateo donde esté.
    const m = nivelMateo('INF');
    const inf = v.grupo.find((g: { habilidad: string }) => g.habilidad === 'INF');
    expect(inf).toMatchObject({ distribucion: { C: 2 + Number(m === 'C'), B: Number(m === 'B'), A: Number(m === 'A'), AD: 1 + Number(m === 'AD'), descubriendo: Number(m === null) }, sinDatos: 1 });
    expect(JSON.stringify(v)).not.toMatch(/indicesCorrectos|clavesEvidencia|hashPin|email/);
  });

  it('RF-065: alerta por 2 habilidades en inicio; quien nunca empezó cuenta desde su matrícula', async () => {
    let v = (await panel().expect(200)).body;
    expect(v.alertas.map((a: { alias: string; riesgo: { motivos: string[] } }) => `${a.alias}:${a.riesgo.motivos.join('+')}`)).toEqual(['Sofía:HABILIDADES_EN_INICIO']);
    await t.prisma.matricula.updateMany({ where: { aulaId: aula.aulaId, estudianteId: aula.ids['Luis'] }, data: { creadaEn: haceDias(10) } });
    v = (await panel().expect(200)).body;
    expect(estudiante(v, 'Luis').riesgo).toMatchObject({ enRiesgo: true, motivos: ['SIN_ACTIVIDAD'], diasSinActividad: null });
    expect(v.resumenSemanal.enRiesgo).toBe(2);
  });

  it('RF-065: el resumen de la semana sale de la vista de actividad semanal', async () => {
    const v = (await panel().expect(200)).body;
    const hoy = fechaLocalLima(new Date());
    expect(v.resumenSemanal.actual).toMatchObject({ semana: lunesDeLaSemana(hoy), estudiantesActivos: 1, totalEstudiantes: 5, lecturasFinalizadas: 2 });
    expect(v.resumenSemanal.actual.respuestas).toBeGreaterThanOrEqual(6);
    expect(v.resumenSemanal.anterior).toMatchObject({ estudiantesActivos: 0, lecturasFinalizadas: 0 });
    expect(estudiante(v, 'Mateo').lecturasSemana).toBe(2);
  });

  it('RF-066: refuerzo grupal para INF (40 % del aula en inicio) con una lectura, asignable con un clic', async () => {
    const v = (await panel().expect(200)).body;
    expect(v.refuerzos).toEqual([
      { habilidad: 'INF', estudianteIds: [aula.ids['Sofía'], aula.ids['Teo']], alias: ['Sofía', 'Teo'], porcentaje: 40, lectura: { id: killa.lecturaId, titulo: 'Killa y la llama', nivelDificultad: 2 } },
    ]);
    const r = v.refuerzos[0];
    const fechaLimite = new Date(Date.now() + 7 * 86_400_000 - 5 * 3_600_000).toISOString().slice(0, 10);
    const asignacion = (await t.http().post(`${API}/aulas/${aula.aulaId}/asignaciones`).set(bearer(rosa.token)).send({ tipo: 'LECTURA', contenidoId: r.lectura.id, fechaLimite, estudianteIds: r.estudianteIds }).expect(201)).body;
    const destinatarios = await t.prisma.asignacionDestinatario.findMany({ where: { asignacionId: asignacion.id } });
    expect(destinatarios.map((d) => d.estudianteId).sort()).toEqual([aula.ids['Sofía'], aula.ids['Teo']].sort());
  });

  it('las vistas se actualizan al refrescarse (cada 5 minutos): un estudiante nuevo aparece al instante', async () => {
    await t.http().post(`${API}/aulas/${aula.aulaId}/matriculas`).set(bearer(rosa.token)).send({ alias: 'Zoe', anioNacimiento: new Date().getFullYear() - 9, mesNacimiento: 2, avatar: 'panda' }).expect(201);
    const v = (await panel().expect(200)).body;
    expect(v.totalEstudiantes).toBe(6);
    expect(estudiante(v, 'Zoe').celdas.every((c) => c.valor === null)).toBe(true);
    const antes = v.actualizadoEn;
    await casos.vistas.refrescar();
    expect((await panel().expect(200)).body.actualizadoEn > antes).toBe(true);
  });
});

describe('Detalle del estudiante (RF-064)', () => {
  it('sus últimas sesiones con lo que respondió, las evidencias que eligió y las pistas que usó', async () => {
    const v = (await t.http().get(`${API}/aulas/${aula.aulaId}/estudiantes/${aula.ids['Mateo']}/detalle`).set(bearer(rosa.token)).expect(200)).body;
    expect(v.estudiante).toMatchObject({ id: aula.ids['Mateo'], alias: 'Mateo', avatar: 'zorro' });
    expect(v.sesiones).toHaveLength(2);
    expect(v.sesiones[0].esRepeticion).toBe(true); // la más reciente primero
    expect(new Date(v.sesiones[0].iniciadaEn).getTime()).toBeGreaterThanOrEqual(new Date(v.sesiones[1].iniciadaEn).getTime());
    const [inf, evidencia, abierta] = v.sesiones[1].respuestas;
    expect(inf).toMatchObject({ habilidad: 'INF', esCorrecta: true, pistasUsadas: 1, pistas: [{ nivel: 'P1', texto: 'Vuelve a la oración que acabas de leer.' }], respuesta: 'Le dolía algo' });
    expect(evidencia).toMatchObject({ habilidad: 'LIT', modalidad: 'EVIDENCIA', esCorrecta: true, pistasUsadas: 0, evidencias: ['Killa vio que tenía una espina en la pata.'] });
    expect(abierta).toMatchObject({ habilidad: 'ARG', esCorrecta: null, respuesta: 'Sí, porque así encontró la espina y lo curó' });
    // Tasa de acierto sin pista: 1 de 2 cerradas en cada lectura.
    expect(v.sesiones[1].tasa).toEqual({ cerradas: 2, sinPista: 1, tasa: 50 });
    expect(v.tasaSinPista).toEqual({ cerradas: 4, sinPista: 2, tasa: 50 });
    expect(v.habilidades.find((h: { habilidad: string }) => h.habilidad === 'INF').tasa).toEqual({ cerradas: 2, sinPista: 0, tasa: 0 });
    expect(v.habilidades.find((h: { habilidad: string }) => h.habilidad === 'LIT').tasa).toEqual({ cerradas: 2, sinPista: 2, tasa: 100 });
    expect(JSON.stringify(v)).not.toMatch(/indicesCorrectos|clavesEvidencia|explicacionModelada/);
  });

  it('RN-17: el estudiante de otra aula o el aula de otra docente responden como si no existieran', async () => {
    await t.http().get(`${API}/aulas/${aula.aulaId}/estudiantes/${aulaOtra.ids['Iris']}/detalle`).set(bearer(rosa.token)).expect(404);
    await t.http().get(`${API}/aulas/${aula.aulaId}/estudiantes/${aula.ids['Mateo']}/detalle`).set(bearer(otra.token)).expect(404);
    await t.http().get(`${API}/aulas/${aula.aulaId}/estudiantes/no-es-un-id/detalle`).set(bearer(rosa.token)).expect(404);
  });
});

describe('Reporte del aula (RF-067)', () => {
  const reporte = (formato: string) => t.http().get(`${API}/aulas/${aula.aulaId}/reporte?formato=${formato}`).set(bearer(rosa.token)).buffer(true).parse((res, cb) => {
    const partes: Buffer[] = [];
    res.on('data', (c: Buffer) => partes.push(c));
    res.on('end', () => cb(null, Buffer.concat(partes)));
  });

  it('CSV: una fila por estudiante con su maestría y nivel por habilidad, listo para Excel', async () => {
    const r = await reporte('csv').expect(200);
    expect(r.headers['content-type']).toMatch(/^text\/csv/);
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="reporte-4-a-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(r.headers['cache-control']).toBe('no-store');
    const texto = (r.body as Buffer).toString('utf8');
    expect(texto.charCodeAt(0)).toBe(0xfeff);
    const lineas = texto.slice(1).trim().split('\r\n');
    expect(lineas).toHaveLength(7);
    expect(lineas[0]).toMatch(/^Estudiante,Comprensión literal \(maestría\),Comprensión literal \(nivel\),Inferencias/);
    expect(lineas.find((l) => l.startsWith('Sofía,'))).toContain('20,C (En inicio)');
    expect(lineas.find((l) => l.startsWith('Luis,'))).toContain('Sin actividad');
  });

  it('PDF (A4) en segundos, y un formato desconocido se rechaza', async () => {
    const inicio = Date.now();
    const r = await reporte('pdf').expect(200);
    expect(Date.now() - inicio).toBeLessThan(30_000);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((r.body as Buffer).length).toBeGreaterThan(1500);
    await t.http().get(`${API}/aulas/${aula.aulaId}/reporte?formato=xls`).set(bearer(rosa.token)).expect(400);
    await t.http().get(`${API}/aulas/${aula.aulaId}/reporte?formato=csv`).set(bearer(otra.token)).expect(404);
  });
});

describe('Resumen semanal (RF-065)', () => {
  it('desde el lunes a las 07:00 de Lima se envía una vez a cada docente con sus aulas', async () => {
    const lunes = lunesDeLaSemana(fechaLocalLima(new Date()));
    // El miércoles de la próxima semana: toca resumir la semana en curso (la de las lecturas de Mateo).
    const miercoles = new Date(Date.parse(`${lunes}T15:00:00Z`) + 9 * 86_400_000);
    const resumen = new ResumenSemanalUseCase(
      new PrismaReportesRepository(t.prisma),
      new AulasDocenteEscuela(t.app.get(EscuelaFacade)),
      casos.panel,
      new NotificadorDocenteIam(t.app.get(IamFacade)),
      'http://localhost:3002',
      () => miercoles,
    );
    expect(await resumen.enviarPendientes()).toBe(2);
    expect(await resumen.enviarPendientes()).toBe(0);
    const correos = (await t.http().get(`${API}/dev/correos`)).body as { para: string; asunto: string; texto: string; enlace: string }[];
    const deRosa = correos.filter((c) => c.para === rosa.email && c.asunto.startsWith('Resumen semanal de tus aulas'));
    expect(deRosa).toHaveLength(1);
    expect(deRosa[0]!.texto).toContain('4.° A: 1 de 6 estudiantes leyeron; 2 lecturas terminadas');
    expect(deRosa[0]!.texto).toContain('Para acompañar');
    expect(deRosa[0]!.texto).toContain('Refuerzo grupal sugerido: inferencias (33 % del aula en inicio)');
    expect(deRosa[0]!.enlace).toBe('http://localhost:3002/docente');
    expect(await t.prisma.resumenSemanalEnviado.count({ where: { semana: new Date(`${lunes}T00:00:00Z`) } })).toBe(2);
    // El lunes antes de las 07:00 de Lima aún no se envía.
    const temprano = new ResumenSemanalUseCase(new PrismaReportesRepository(t.prisma), new AulasDocenteEscuela(t.app.get(EscuelaFacade)), casos.panel, new NotificadorDocenteIam(t.app.get(IamFacade)), '', () => new Date(Date.parse(`${lunes}T10:00:00Z`) + 14 * 86_400_000));
    expect(await temprano.enviarPendientes()).toBe(0);
  });
});

describe('Riesgo por inactividad (RF-065)', () => {
  it('RF-065: con 9 días sin leer aparece en riesgo con sus días', async () => {
    await t.prisma.sesionLectura.updateMany({ where: { estudianteId: aula.ids['Mateo'] }, data: { iniciadaEn: haceDias(9), ultimaActividadEn: haceDias(9) } });
    await t.prisma.respuestaDiagnostico.updateMany({ where: { diagnostico: { estudianteId: aula.ids['Mateo'] } }, data: { respondidaEn: haceDias(12) } });
    await casos.vistas.refrescar();
    const v = (await t.http().get(`${API}/aulas/${aula.aulaId}/estudiantes/${aula.ids['Mateo']}/detalle`).set(bearer(rosa.token)).expect(200)).body;
    expect(v.riesgo).toMatchObject({ enRiesgo: true, motivos: ['SIN_ACTIVIDAD'], diasSinActividad: 9 });
  });
});

describe('Acceso (RN-17, RNF-012)', () => {
  it('solo la docente del aula ve su panel', async () => {
    await panel(aula.aulaId, otra.token).expect(404);
    await panel('no-es-un-id').expect(404);
    await t.http().get(`${API}/aulas/${aula.aulaId}/panel`).expect(401);
    await t.http().get(`${API}/aulas/${aula.aulaId}/panel`).set(bearer(tokenMateo)).expect(403);
  });
});

describe('Rendimiento (RNF-003)', () => {
  it('el panel de un aula de 40 estudiantes con datos responde en menos de 1,5 s', async () => {
    const grande = await crearAula(rosa.token, '4.° C', Array.from({ length: 40 }, (_, i) => `Niño ${i + 1}`));
    for (const [i, id] of Object.values(grande.ids).entries()) await maestria(id, { INF: i % 3 === 0 ? 20 : 75, CRI: i % 4 === 0 ? 30 : 60 });
    await casos.vistas.refrescar();
    await panel(grande.aulaId).expect(200); // calienta conexiones
    const inicio = Date.now();
    const v = (await panel(grande.aulaId).expect(200)).body;
    expect(Date.now() - inicio).toBeLessThan(1500);
    expect(v.totalEstudiantes).toBe(40);
    expect(v.refuerzos.map((r: { habilidad: string }) => r.habilidad)).toEqual(['INF']); // 14 de 40 = 35 %; CRI 10 de 40 = 25 %
  });
});
