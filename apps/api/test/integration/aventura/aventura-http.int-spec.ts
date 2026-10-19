import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import {
  AVANCE_LECTURAS,
  AvanceLectura,
  BUS_EVENTOS,
  BusEventos,
  crearEvento,
  DIAGNOSTICO_INICIAL,
  EVENTOS_INTEGRACION,
  MAESTRIA_LECTOR,
  Maestrias,
  RegistroAvanceLecturas,
  RegistroDiagnosticoInicial,
  RegistroMaestria,
  ResultadoDiagnosticoInicial,
  uuidV7,
} from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Aventura integrada (RF-030 a RF-033) contra PostgreSQL real: backoffice de misiones con
 * MFA y auditoría, mapa del estudiante y su avance movido por los eventos que publicarán los
 * Módulos 5, 6 y 7 (aquí se publican en el bus real y sus puertos se registran como lo harán ellos).
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';
const TEXTO = 'Había una vez un zorro que miraba la luna. Quería tocarla.\nUna tarde subió al cerro. Pero la luna seguía lejos.';

let t: AppDePrueba;
let bus: BusEventos;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// Lo que aportarán los Módulos 5 (diagnóstico), 6 (sesiones de lectura) y 7 (perfil lector).
const diagnosticos = new Map<string, ResultadoDiagnosticoInicial>();
const maestrias = new Map<string, Maestrias>();
const avance = new Map<string, Map<string, AvanceLectura>>();

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
  bus = t.app.get<BusEventos>(BUS_EVENTOS);
  t.app.get<RegistroDiagnosticoInicial>(DIAGNOSTICO_INICIAL).registrar({ resultadoDe: async (id) => diagnosticos.get(id) ?? { estado: 'SIN_MODULO' } });
  t.app.get<RegistroMaestria>(MAESTRIA_LECTOR).registrar({ maestriasDe: async (id) => maestrias.get(id) ?? null });
  t.app.get<RegistroAvanceLecturas>(AVANCE_LECTURAS).registrar({
    avanceDe: async (id, lecturaIds) => new Map(lecturaIds.filter((l) => avance.get(id)?.has(l)).map((l) => [l, avance.get(id)?.get(l) as AvanceLectura])),
  });
});

afterAll(async () => {
  await t?.cerrar();
});

async function backoffice(rol: 'EDITOR' | 'REVISOR') {
  const email = `${rol.toLowerCase()}.${uuidV7().slice(-6)}@lectoaventura.test`;
  const secreto = authenticator.generateSecret();
  const cuenta = await t.prisma.cuenta.create({
    data: { id: uuidV7(), nombre: `${rol} Prueba`, email, hashContrasena: await new Argon2HashService().hash(CONTRASENA), rol, estado: 'ACTIVA' },
  });
  await t.prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
  const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA, codigoMfa: authenticator.generate(secreto) }).expect(200);
  return { id: cuenta.id, token: login.body.accessToken as string };
}

async function docente() {
  const email = `docente.${uuidV7().slice(-6)}@lectoaventura.test`;
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Pérez', email, contrasena: CONTRASENA, rol: 'DOCENTE' }).expect(201);
  const enlace = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  return (await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken as string;
}

/** Lectura publicada por el flujo real de Contenido (editora → revisor). */
async function publicar(titulo: string, rangoEdad: 'R1' | 'R2' | 'R3') {
  const { lecturaId, oraciones } = (
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora.token)).send({
      metadatos: { titulo, rangoEdad, nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF'], licencia: 'CC BY 4.0' },
      texto: TEXTO,
    }).expect(201)
  ).body;
  await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora.token)).send({
    actividades: [{
      momento: 'DESPUES', tipo: 'EVIDENCIA',
      items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca la evidencia', clavesEvidencia: [oraciones[3].id], explicacionModelada: 'La última oración lo dice.', pistas: [{ nivel: 'P1', texto: 'Busca al final.' }] }],
    }],
  }).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora.token)).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisor.token)).expect(200);
  return lecturaId as string;
}

/** Publica en el bus lo que publicará Lectura (Módulo 6) cuando el niño termine una lectura. */
async function terminarLectura(estudianteId: string, lecturaId: string) {
  const suyo = avance.get(estudianteId) ?? new Map<string, AvanceLectura>();
  suyo.set(lecturaId, 'FINALIZADA');
  avance.set(estudianteId, suyo);
  await bus.publicar([crearEvento(EVENTOS_INTEGRACION.SESION_LECTURA_FINALIZADA, uuidV7(), { estudianteId, lecturaId })]);
}

let editora: Awaited<ReturnType<typeof backoffice>>;
let revisor: Awaited<ReturnType<typeof backoffice>>;
let tokenDocente: string;
let aulaId: string;
const ninos: Record<'mateo' | 'lucia', { id: string; token: string }> = {} as never;
let mundos: { id: string; numero: number }[];
const lecturasR2: string[] = [];
const misionesR2: string[] = [];

describe('Preparación: lecturas publicadas y un aula con dos niños', () => {
  it('editora, revisor, docente y niños de 9 y 11 años con sesión en la tablet del aula', async () => {
    editora = await backoffice('EDITOR');
    revisor = await backoffice('REVISOR');
    for (let i = 1; i <= 4; i++) lecturasR2.push(await publicar(`Lectura ${i} para 8–9 años`, 'R2'));
    tokenDocente = await docente();
    aulaId = (await t.http().post(`${API}/aulas`).set(bearer(tokenDocente)).send({
      nombre: '4.° A', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body.id;
    const anio = new Date().getFullYear();
    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(tokenDocente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    for (const [clave, alias, edad] of [['mateo', 'Mateo', 9], ['lucia', 'Lucía', 11]] as const) {
      const m = (await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(tokenDocente)).send({ alias, anioNacimiento: anio - edad, mesNacimiento: 1, avatar: 'zorro' }).expect(201)).body;
      await t.http().post(`${API}/estudiantes/${m.estudianteId}/pin/restablecer`).set(bearer(tokenDocente)).send({ pinNuevo: '4826' }).expect(200);
      const token = (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: m.estudianteId, pin: '4826' }).expect(200)).body.accessToken;
      ninos[clave] = { id: m.estudianteId, token };
    }
    mundos = (await t.http().get(`${API}/backoffice/mundos`).set(bearer(editora.token)).expect(200)).body;
    expect(mundos.map((m) => m.numero)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('Backoffice de misiones (RF-032)', () => {
  it('solo editores (y revisores para consultar) con MFA; el esqueleto de ejemplo ya no existe', async () => {
    await t.http().get(`${API}/backoffice/mundos`).set(bearer(tokenDocente)).expect(403);
    await t.http().get(`${API}/backoffice/mundos`).set(bearer(ninos.mateo.token)).expect(403);
    await t.http().get(`${API}/backoffice/mundos/${mundos[0]?.id}/misiones?edad=R2`).set(bearer(revisor.token)).expect(200);
    await t.http().post(`${API}/backoffice/mundos/${mundos[0]?.id}/misiones`).set(bearer(revisor.token)).send({ rangoEdad: 'R2', titulo: 'No', lecturaIds: [lecturasR2[0]] }).expect(403);
    await t.http().post(`${API}/aventura/demo`).set(bearer(ninos.mateo.token)).send({}).expect(404);
  });

  it('la editora arma 3 misiones del Explorador para 8–9 años; cada una queda en sus tablas y en la auditoría', async () => {
    const explorador = mundos[0]?.id as string;
    for (const [i, lecturaIds] of [[lecturasR2[0]], [lecturasR2[1]], [lecturasR2[2], lecturasR2[3]]].entries()) {
      const r = await t.http().post(`${API}/backoffice/mundos/${explorador}/misiones`).set(bearer(editora.token))
        .send({ rangoEdad: 'R2', titulo: `Misión ${i + 1}`, descripcion: 'Sigue las huellas', lecturaIds }).expect(201);
      expect(r.body).toMatchObject({ orden: i + 1, rangoEdad: 'R2', lecturas: lecturaIds.map((id) => ({ id, publicada: true })) });
      misionesR2.push(r.body.id);
    }
    const filas = await t.prisma.misionLectura.findMany({ where: { misionId: misionesR2[2] }, orderBy: { orden: 'asc' } });
    expect(filas.map((f) => [f.lecturaId, f.orden])).toEqual([[lecturasR2[2], 1], [lecturasR2[3], 2]]);
    expect(await t.prisma.auditoria.count({ where: { accion: 'MISION_CREADA', actorId: editora.id, actorRol: 'EDITOR' } })).toBe(3);
    const lista = (await t.http().get(`${API}/backoffice/mundos`).set(bearer(editora.token)).expect(200)).body;
    expect(lista[0].misionesPorEdad).toEqual({ R1: 0, R2: 3, R3: 0 });
    const disponibles = (await t.http().get(`${API}/backoffice/misiones/lecturas-disponibles?edad=R2`).set(bearer(editora.token)).expect(200)).body;
    expect(disponibles.map((f: { id: string }) => f.id).sort()).toEqual([...lecturasR2].sort());
  });

  it('rechaza lecturas de otra edad o no publicadas, y datos inválidos', async () => {
    const explorador = mundos[0]?.id as string;
    const deOnce = await publicar('Volcanes del Perú', 'R3');
    const otraEdad = await t.http().post(`${API}/backoffice/mundos/${explorador}/misiones`).set(bearer(editora.token)).send({ rangoEdad: 'R2', titulo: 'Volcanes', lecturaIds: [deOnce] }).expect(400);
    expect(otraEdad.body.detail).toBe('"Volcanes del Perú" es para 10–12 años y la misión es para 8–9 años');
    await t.http().post(`${API}/backoffice/mundos/${explorador}/misiones`).set(bearer(editora.token)).send({ rangoEdad: 'R2', titulo: 'Fantasma', lecturaIds: [uuidV7()] }).expect(400);
    await t.http().post(`${API}/backoffice/mundos/${explorador}/misiones`).set(bearer(editora.token)).send({ rangoEdad: 'R9', titulo: 'Edad', lecturaIds: [lecturasR2[0]] }).expect(400);
    await t.http().post(`${API}/backoffice/mundos/${explorador}/misiones`).set(bearer(editora.token)).send({ rangoEdad: 'R2', titulo: 'Ab', lecturaIds: [lecturasR2[0]] }).expect(400);
    await t.http().post(`${API}/backoffice/mundos/${uuidV7()}/misiones`).set(bearer(editora.token)).send({ rangoEdad: 'R2', titulo: 'Sin mundo', lecturaIds: [lecturasR2[0]] }).expect(404);
    expect(await t.prisma.mision.count()).toBe(3);
  });

  it('reordenar intercambia posiciones en una transacción (restricción única diferible)', async () => {
    const explorador = mundos[0]?.id as string;
    const nuevo = [misionesR2[2], misionesR2[0], misionesR2[1]];
    const r = await t.http().put(`${API}/backoffice/mundos/${explorador}/orden`).set(bearer(editora.token)).send({ rangoEdad: 'R2', misionIds: nuevo }).expect(200);
    expect(r.body.map((m: { id: string; orden: number }) => [m.id, m.orden])).toEqual(nuevo.map((id, i) => [id, i + 1]));
    const enBase = await t.prisma.mision.findMany({ where: { mundoId: explorador }, orderBy: { orden: 'asc' }, select: { id: true } });
    expect(enBase.map((m) => m.id)).toEqual(nuevo);
    await t.http().put(`${API}/backoffice/mundos/${explorador}/orden`).set(bearer(editora.token)).send({ rangoEdad: 'R2', misionIds: nuevo.slice(1) }).expect(400);
    expect(await t.prisma.auditoria.count({ where: { accion: 'MISIONES_REORDENADAS', recursoId: explorador } })).toBe(1);
  });

  it('la base rechaza misiones con edad inválida o progresos imposibles (segunda barrera)', async () => {
    await expect(t.prisma.$executeRaw`INSERT INTO aventura.mision (id, mundo_id, rango_edad, orden, titulo) VALUES (${uuidV7()}::uuid, ${mundos[0]?.id}::uuid, 'R9', 9, 'Mala edad')`).rejects.toThrow(/ck_mision_rango_edad/);
    await expect(t.prisma.$executeRaw`INSERT INTO aventura.progreso_mundo (estudiante_id, mundo_id, estado) VALUES (${uuidV7()}::uuid, ${mundos[0]?.id}::uuid, 'COMPLETADO')`).rejects.toThrow(/ck_progreso_mundo_fechas/);
  });
});

describe('Mapa del estudiante (RF-030, RF-032, RF-033)', () => {
  it('sin el Módulo 5, Mateo (9 años) empieza en el Explorador; los demás mundos están bloqueados', async () => {
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(mapa).toMatchObject({ diagnosticoPendiente: false, mundoActual: 1 });
    expect(mapa.mundos.map((m: { estado: string }) => m.estado)).toEqual(['DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(mapa.mundos[0].misiones).toEqual({ completadas: 0, total: 3, necesarias: 3 });
    await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.mateo.token)).expect(200);
    expect(await t.prisma.progresoMundo.count({ where: { estudianteId: ninos.mateo.id } })).toBe(5);
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'aventura.EstudiantePosicionado', agregadoId: ninos.mateo.id } })).toBe(1);
  });

  it('ve las misiones de su edad en orden, con las lecturas sin respuestas; un mundo bloqueado da 409', async () => {
    const r = (await t.http().get(`${API}/aventura/mundos/${mundos[0]?.id}/misiones`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(r.misiones.map((m: { id: string; estado: string }) => [m.id, m.estado])).toEqual([[misionesR2[2], 'PENDIENTE'], [misionesR2[0], 'PENDIENTE'], [misionesR2[1], 'PENDIENTE']]);
    expect(r.misiones[0].lecturas.map((l: { titulo: string; avance: string }) => [l.titulo, l.avance])).toEqual([['Lectura 3 para 8–9 años', 'PENDIENTE'], ['Lectura 4 para 8–9 años', 'PENDIENTE']]);
    expect(JSON.stringify(r)).not.toMatch(/indice|pistas|explicacion|claves/i);
    const bloqueado = await t.http().get(`${API}/aventura/mundos/${mundos[1]?.id}/misiones`).set(bearer(ninos.mateo.token)).expect(409);
    expect(bloqueado.body.detail).toMatch(/bloqueado/);
    await t.http().get(`${API}/aventura/mundos/${uuidV7()}/misiones`).set(bearer(ninos.mateo.token)).expect(404);
    await t.http().get(`${API}/aventura/mapa`).set(bearer(tokenDocente)).expect(403);
  });

  it('RN-05 y RF-033: Lucía con diagnóstico pendiente no tiene mapa; al finalizarlo con LIT 80 y VOC 66 empieza en el Detective', async () => {
    diagnosticos.set(ninos.lucia.id, { estado: 'PENDIENTE' });
    const pendiente = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.lucia.token)).expect(200)).body;
    expect(pendiente.diagnosticoPendiente).toBe(true);
    await t.http().get(`${API}/aventura/mundos/${mundos[0]?.id}/misiones`).set(bearer(ninos.lucia.token)).expect(409);
    expect(await t.prisma.progresoMundo.count({ where: { estudianteId: ninos.lucia.id } })).toBe(0);

    diagnosticos.set(ninos.lucia.id, { estado: 'FINALIZADO', maestrias: { LIT: 80, VOC: 66, INF: 50, CRI: 40, ARG: 30 } });
    await bus.publicar([crearEvento(EVENTOS_INTEGRACION.DIAGNOSTICO_FINALIZADO, uuidV7(), { estudianteId: ninos.lucia.id, maestrias: { LIT: 80, VOC: 66, INF: 50, CRI: 40, ARG: 30 } })]);
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(ninos.lucia.token)).expect(200)).body;
    expect(mapa.mundos.map((m: { estado: string }) => m.estado)).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(mapa.mundos[1].celebrar).toBe(false); // el mundo inicial no se celebra
    // Las misiones de 8–9 años no son de Lucía (11 años).
    expect(mapa.mundos[0].misiones.total).toBe(0);
  });
});

describe('Avance y desbloqueo por eventos (RF-031, RF-032, RN-09)', () => {
  it('terminar lecturas completa misiones; con LIT y VOC ≥ 65 y 3 misiones se abre el Detective con celebración', async () => {
    const yo = ninos.mateo;
    maestrias.set(yo.id, { LIT: 70, VOC: 68, INF: 40 });
    await terminarLectura(yo.id, lecturasR2[0] as string);
    await terminarLectura(yo.id, lecturasR2[1] as string);
    expect((await t.http().get(`${API}/aventura/mapa`).set(bearer(yo.token))).body.mundos[1].estado).toBe('BLOQUEADO');
    await terminarLectura(yo.id, lecturasR2[2] as string); // la misión 3 tiene dos lecturas: sigue en curso
    const enCurso = await t.prisma.progresoMision.findUnique({ where: { estudianteId_misionId: { estudianteId: yo.id, misionId: misionesR2[2] as string } } });
    expect(enCurso).toMatchObject({ estado: 'EN_CURSO', completadaEn: null });

    const t0 = Date.now();
    await terminarLectura(yo.id, lecturasR2[3] as string);
    expect(Date.now() - t0).toBeLessThan(2000); // RF-031: desbloqueo en ≤ 2 s tras el evento que cumple el umbral
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(yo.token)).expect(200)).body;
    expect(mapa.mundos.map((m: { estado: string }) => m.estado)).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(mapa.mundos[0].misiones.completadas).toBe(3);
    expect(mapa.mundos[1].celebrar).toBe(true);
    const evento = await t.prisma.outboxEvento.findFirst({ where: { tipo: 'aventura.MundoDesbloqueado', agregadoId: yo.id } });
    expect(evento?.payload).toEqual({ estudianteId: yo.id, mundoCompletado: 1, mundoDesbloqueado: 2 });
    expect(evento?.publicadoEn).not.toBeNull();
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'aventura.MisionCompletada' } })).toBe(3);

    await t.http().post(`${API}/aventura/mundos/${mundos[1]?.id}/celebracion`).set(bearer(yo.token)).expect(204);
    expect((await t.http().get(`${API}/aventura/mapa`).set(bearer(yo.token))).body.mundos[1].celebrar).toBe(false);
    const fila = await t.prisma.progresoMundo.findUnique({ where: { estudianteId_mundoId: { estudianteId: yo.id, mundoId: mundos[1]?.id as string } } });
    expect(fila?.celebradoEn).not.toBeNull();
  });

  it('repetir el evento no desbloquea dos veces ni hace retroceder misiones', async () => {
    await terminarLectura(ninos.mateo.id, lecturasR2[3] as string);
    await bus.publicar([crearEvento(EVENTOS_INTEGRACION.MAESTRIA_ACTUALIZADA, uuidV7(), { estudianteId: ninos.mateo.id })]);
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'aventura.MundoDesbloqueado', agregadoId: ninos.mateo.id } })).toBe(1);
    expect(await t.prisma.progresoMision.count({ where: { estudianteId: ninos.mateo.id, estado: 'COMPLETADA' } })).toBe(3);
  });

  it('las misiones aparecen en el catálogo para asignar del aula, con su mundo y su edad (Módulo 2)', async () => {
    const catalogo = (await t.http().get(`${API}/aulas/${aulaId}/asignaciones/catalogo`).set(bearer(tokenDocente)).expect(200)).body;
    expect(catalogo.misiones).toHaveLength(3);
    expect(catalogo.misiones[0]).toMatchObject({ tipo: 'MISION', detalle: 'Mundo 1 · Explorador · 8–9 años' });
  });
});
