import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import {
  BUS_EVENTOS,
  BusEventos,
  crearEvento,
  EVENTOS_INTEGRACION,
  fechaLocalLima,
  lunesDeLaSemana,
  uuidV7,
} from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Gamificación integrada (RF-056 a RF-062) contra PostgreSQL real: una lectura real deja en el
 * libro de puntos un asiento por motivo (RN-11, RN-19, UAT-02), suma a "Detective de Evidencias"
 * (UAT-03), a la racha y al reto del día; reentregar los eventos no suma dos veces; repetir da el 25 % y
 * el tope diario de 300 se respeta aunque lleguen muchos logros a la vez (RN-12); las insignias son
 * irrevocables (RN-13) y canjear recompensas descuenta monedas, nunca puntos (RF-062).
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';
const TEXTO = 'Killa vivía en Puno. Cada mañana cuidaba a su llama Pancho.\nUn día Pancho no quiso comer. Killa vio que tenía una espina en la pata.\nCon cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.';

let t: AppDePrueba;
let bus: BusEventos;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const hoy = () => fechaLocalLima(new Date());
const diaAntes = (dias: number) => new Date(Date.parse(`${hoy()}T00:00:00Z`) - dias * 86_400_000);

beforeAll(async () => {
  t = await crearApp();
  bus = t.app.get<BusEventos>(BUS_EVENTOS);
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

async function docente() {
  const email = `docente.${uuidV7().slice(-6)}@lectoaventura.test`;
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Pérez', email, contrasena: CONTRASENA, rol: 'DOCENTE' }).expect(201);
  const enlace = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  return (await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken as string;
}

const pista = (nivel: string, texto: string) => ({ nivel, texto });

/** Lectura de 8–9 años publicada por el flujo real; `killa`: inferencia con pistas, evidencia y una abierta. */
async function publicar(titulo: string, killa: boolean) {
  const { lecturaId, oraciones } = (
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora)).send({
      metadatos: { titulo, rangoEdad: 'R2', nivelDificultad: killa ? 2 : 1, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: killa ? ['INF', 'ARG'] : ['INF'], licencia: 'CC BY 4.0' },
      texto: TEXTO,
    }).expect(201)
  ).body as { lecturaId: string; oraciones: { id: string }[] };
  const o = oraciones.map((x) => x.id);
  const actividades = killa
    ? [
        { momento: 'ANTES', tipo: 'PREDICCION', items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'ESCRITURA', enunciado: '¿Qué crees que le pasará a la llama?', explicacionModelada: 'Al leer lo sabrás.' }] },
        {
          momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: o[2],
          items: [{ habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1, explicacionModelada: 'Tenía una espina.', pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.'), pista('P2', 'Mira el segundo párrafo.'), pista('P3', '¿Cómo se siente alguien que no come?')] }],
        },
        {
          momento: 'DURANTE', tipo: 'EVIDENCIA', oracionAnclajeId: o[3],
          items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Toca la oración que dice qué tenía Pancho.', clavesEvidencia: [o[3]], explicacionModelada: 'La oración de la espina.', pistas: [pista('P1', 'Busca en el segundo párrafo.')] }],
        },
        { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'ESCRITURA', enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', explicacionModelada: 'Sí: así encontró la espina.' }] },
      ]
    : [{ momento: 'DESPUES', tipo: 'SELECCION', items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'SELECCION', enunciado: '¿Por qué sonrió Killa?', opciones: ['Pancho comió feliz', 'Llovió mucho'], indiceCorrecto: 0, explicacionModelada: 'Pancho ya estaba bien.', pistas: [pista('P1', 'Mira la última oración.')] }] }];
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

/** Lee la lectura completa por la API; `fallarInferencia`: primero se equivoca y corrige tras la pista P1. */
async function leer(token: string, l: { lecturaId: string; o: string[] }, fallarInferencia = false) {
  const inicio = (await t.http().post(`${API}/sesiones-lectura`).set(bearer(token)).send({ lecturaId: l.lecturaId }).expect(201)).body;
  const id = inicio.id as string;
  if (inicio.fase === 'PREDICCION') await t.http().put(`${API}/sesiones-lectura/${id}/prediccion`).set(bearer(token)).send({ texto: 'Creo que la llama se enfermará' }).expect(200);
  let primerIntento = true;
  for (let paso = 0; paso < 12; paso++) {
    const s = (await t.http().get(`${API}/sesiones-lectura/${id}`).set(bearer(token)).expect(200)).body;
    const p = s.pregunta as { itemId: string; enunciado: string; opciones: string[] } | null;
    if (!p) break;
    let cuerpo: Record<string, unknown>;
    if (p.enunciado === '¿Por qué Pancho no quiso comer?') {
      cuerpo = { indice: p.opciones.indexOf(fallarInferencia && primerIntento ? 'Estaba feliz' : 'Le dolía algo') };
      primerIntento = false;
    } else if (p.enunciado.startsWith('Toca la oración')) cuerpo = { oraciones: [l.o[3]] };
    else if (p.enunciado.startsWith('¿Fue buena idea')) cuerpo = { texto: 'Sí, porque así encontró la espina y lo curó' };
    else cuerpo = { indice: p.opciones.indexOf('Pancho comió feliz') };
    await t.http().post(`${API}/sesiones-lectura/${id}/respuestas`).set(bearer(token)).send({ itemId: p.itemId, idempotencyKey: uuidV7(), ...cuerpo }).expect(200);
  }
  await t.http().post(`${API}/sesiones-lectura/${id}/finalizar`).set(bearer(token)).send({ reflexion: 'Pensé que se enfermaba y era una espina' }).expect(200);
  return id;
}

/** Un ItemRespondido sin puntaje de maestría (Progreso lo ignora): solo mueve la gamificación. */
function itemSintetico(estudianteId: string, extra: Record<string, unknown> = {}) {
  const respuestaId = uuidV7();
  return crearEvento(EVENTOS_INTEGRACION.ITEM_RESPONDIDO, uuidV7(), {
    estudianteId, respuestaId, sesionId: uuidV7(), lecturaId: uuidV7(), itemId: uuidV7(), habilidad: 'LIT', nivelDificultad: 1,
    esCorrecta: true, pistasUsadas: 0, puntajeItem: null, esRepeticion: false, palabras: null, modalidad: 'SELECCION', ...extra,
  });
}

let editora: string;
let revisora: string;
let tokenDocente: string;
let mateo: { id: string; token: string };
let lia: { id: string; token: string };
let killa: { lecturaId: string; o: string[] };
let bosque: { lecturaId: string; o: string[] };

const pasaporte = (token = mateo.token) => t.http().get(`${API}/yo/pasaporte`).set(bearer(token));
const asientos = (estudianteId = mateo.id) => t.prisma.asientoPuntos.findMany({ where: { estudianteId }, orderBy: { id: 'asc' } });
const insignia = (v: { insignias: { codigo: string }[] }, codigo: string) => v.insignias.find((i) => i.codigo === codigo);
const total = async (estudianteId = mateo.id) => (await asientos(estudianteId)).reduce((s, a) => s + a.puntos, 0);

describe('Preparación', () => {
  it('lecturas publicadas y una docente con Mateo (9 años) y Lía (6 años) en la tablet del aula', async () => {
    editora = await backoffice('EDITOR');
    revisora = await backoffice('REVISOR');
    killa = await publicar('Killa y la llama', true);
    bosque = await publicar('Pistas en el bosque', false);
    tokenDocente = await docente();
    const aulaId = (await t.http().post(`${API}/aulas`).set(bearer(tokenDocente)).send({
      nombre: '4.° A', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body.id;
    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(tokenDocente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    const anio = new Date().getFullYear();
    const ninos: { id: string; token: string }[] = [];
    for (const [alias, edad] of [['Mateo', 9], ['Lía', 6]] as const) {
      const m = (await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(tokenDocente)).send({ alias, anioNacimiento: anio - edad, mesNacimiento: 1, avatar: 'zorro' }).expect(201)).body;
      await t.http().post(`${API}/estudiantes/${m.estudianteId}/pin/restablecer`).set(bearer(tokenDocente)).send({ pinNuevo: '4826' }).expect(200);
      ninos.push({ id: m.estudianteId, token: (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: m.estudianteId, pin: '4826' }).expect(200)).body.accessToken });
    }
    [mateo, lia] = ninos as [typeof mateo, typeof lia];
  });
});

describe('Pasaporte del Lector y reto del día (RF-059, RF-060)', () => {
  it('RF-059: sin logros, el pasaporte muestra el catálogo por ganar, nivel 0 y ninguna moneda', async () => {
    const v = (await pasaporte().expect(200)).body;
    expect(v).toMatchObject({
      alias: 'Mateo', avatar: 'zorro', puntos: { total: 0, hoy: 0, topeDiario: 300 }, nivel: { actual: 0, desde: 0, hasta: 100, faltan: 100 },
      monedas: 0, racha: { dias: 0, mejor: 0, leyoHoy: false, comodinDisponible: true }, mundos: [], lecturas: { total: 0, recientes: [] }, ultimosPuntos: [],
    });
    expect(v.insignias.map((i: { codigo: string }) => i.codigo)).toEqual([
      'PRIMERA_LECTURA', 'DETECTIVE_EVIDENCIAS', 'MAESTRO_INFERENCIAS', 'LECTOR_PERSEVERANTE', 'RANGO_EXPLORADOR', 'RANGO_DETECTIVE', 'RANGO_INVESTIGADOR', 'RANGO_CRITICO', 'MAESTRO_LECTURA',
    ]);
    expect(v.insignias.every((i: { ganada: boolean }) => !i.ganada)).toBe(true);
    expect(insignia(v, 'DETECTIVE_EVIDENCIAS')).toMatchObject({ avance: 0, meta: 5 });
    expect(insignia(v, 'MAESTRO_INFERENCIAS')).toMatchObject({ avance: null, meta: null });
    expect(v.recompensas).toHaveLength(10);
    expect(v.recompensas[0]).toMatchObject({ codigo: 'LUPA', tipo: 'ACCESORIO', costo: 5, tuya: false });
  });

  it('RF-060, RN-18: un reto por día, orientado a la habilidad más débil y con una lectura para lograrlo', async () => {
    await retoInicial(mateo.token, ['LIT', 'VOC']); // INF, CRI y ARG quedan en 0: gana INF por el orden del SRS
    const a = (await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(mateo.token)).expect(200)).body;
    const b = (await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(mateo.token)).expect(200)).body;
    expect(a).toEqual(b);
    expect(a).toMatchObject({ fecha: hoy(), habilidad: 'INF', meta: 3, avance: 0, estado: 'PROPUESTO', minutos: 5, puntos: 15, lectura: { id: bosque.lecturaId, titulo: 'Pistas en el bosque' } });
    expect(await t.prisma.retoDiario.count({ where: { estudianteId: mateo.id } })).toBe(1);
  });

  it('RN-18: el reto de un día anterior sin completar queda vencido', async () => {
    const ayer = await t.prisma.retoDiario.create({ data: { estudianteId: lia.id, fechaLima: diaAntes(1), habilidad: 'LIT', contenido: { meta: 3, avance: 1 } } });
    const v = (await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(lia.token)).expect(200)).body;
    expect(v.fecha).toBe(hoy());
    expect((await t.prisma.retoDiario.findUniqueOrThrow({ where: { id: ayer.id } })).estado).toBe('VENCIDO');
  });
});

describe('Libro de puntos (RF-056, RN-10, RN-11, RN-19)', () => {
  let sesion: string;

  it('UAT-02, UAT-03: una lectura real deja un asiento por motivo y suma a la evidencia, la racha y el reto', async () => {
    sesion = await leer(mateo.token, killa, true);
    expect((await asientos()).map((a) => `${a.motivo}:${a.puntos}`)).toEqual([
      'CORRECTO_TRAS_PISTA:6', // UAT-02: corrige tras la pista P1 (el error no resta, RN-10)
      'ITEM_CORRECTO:10', // la evidencia a la primera
      'RESPUESTA_ABIERTA:10', // RN-19: 9 palabras (≥ 5 en R2) al enviarla
      'LECTURA_COMPLETADA:20',
    ]);
    const a = await asientos();
    expect(a.every((x) => x.fechaLima.toISOString().slice(0, 10) === hoy())).toBe(true);
    expect(a.at(-1)!.eventoOrigen).toBe(sesion);

    const v = (await pasaporte().expect(200)).body;
    expect(v).toMatchObject({ puntos: { total: 46, hoy: 46 }, nivel: { actual: 0, faltan: 54 }, monedas: 4, racha: { dias: 1, mejor: 1, leyoHoy: true } });
    expect(insignia(v, 'PRIMERA_LECTURA')).toMatchObject({ ganada: true, avance: 1, meta: 1 });
    expect(insignia(v, 'DETECTIVE_EVIDENCIAS')).toMatchObject({ ganada: false, avance: 1, meta: 5 }); // UAT-03: aumenta en 1
    expect(v.lecturas).toMatchObject({ total: 1, recientes: [{ id: killa.lecturaId, titulo: 'Killa y la llama' }] });
    expect(v.ultimosPuntos[0]).toMatchObject({ motivo: 'LECTURA_COMPLETADA', puntos: 20 });
    expect((await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(mateo.token)).expect(200)).body).toMatchObject({ habilidad: 'INF', avance: 1, estado: 'PROPUESTO' });
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'gamificacion.InsigniaOtorgada', agregadoId: mateo.id } })).toBe(1);
  });

  it('reentregar los eventos de la lectura desde el outbox no suma dos veces', async () => {
    const eventos = await t.prisma.outboxEvento.findMany({
      where: { agregadoId: sesion, tipo: { in: [EVENTOS_INTEGRACION.ITEM_RESPONDIDO, EVENTOS_INTEGRACION.SESION_LECTURA_FINALIZADA] } },
    });
    expect(eventos.length).toBeGreaterThanOrEqual(4);
    await bus.publicar(eventos.map((e) => crearEvento(e.tipo, e.agregadoId, e.payload as object, e.ocurrioEn)));
    expect(await total()).toBe(46);
    expect((await t.prisma.avanceInsignia.findMany({ where: { estudianteId: mateo.id } })).map((x) => x.avance)).toEqual([1, 1]); // Primera lectura y Detective
    expect((await t.prisma.racha.findUniqueOrThrow({ where: { estudianteId: mateo.id } })).diasActuales).toBe(1);
  });

  it('RN-12: repetir una lectura ya terminada otorga el 25 % y no suma a las insignias', async () => {
    await leer(mateo.token, killa);
    expect((await asientos()).slice(4).map((a) => `${a.motivo}:${a.puntos}`)).toEqual(['ITEM_CORRECTO:3', 'ITEM_CORRECTO:3', 'RESPUESTA_ABIERTA:3', 'LECTURA_COMPLETADA:5']);
    const v = (await pasaporte().expect(200)).body;
    expect(v.puntos.total).toBe(60);
    expect(insignia(v, 'DETECTIVE_EVIDENCIAS')!.avance).toBe(1);
    expect(v.lecturas.total).toBe(1);
    expect(v.racha.dias).toBe(1); // el mismo día no suma otra vez
  });

  it('RF-060, RF-057: completar el reto del día suma +15 y, con 100 puntos, sube al nivel lector 1', async () => {
    await leer(mateo.token, bosque);
    const reto = (await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(mateo.token)).expect(200)).body;
    expect(reto).toMatchObject({ avance: 3, estado: 'COMPLETADO' });
    expect(reto.completadoEn).not.toBeNull();
    expect((await asientos()).slice(8).map((a) => `${a.motivo}:${a.puntos}`)).toEqual(['ITEM_CORRECTO:10', 'RETO_DEL_DIA:15', 'LECTURA_COMPLETADA:20']);
    const v = (await pasaporte().expect(200)).body;
    expect(v).toMatchObject({ puntos: { total: 105 }, nivel: { actual: 1, desde: 100, hasta: 300, faltan: 195 }, monedas: 10 });
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'gamificacion.NivelLectorSubido', agregadoId: mateo.id } })).toBe(1);
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'gamificacion.RetoDelDiaCompletado', agregadoId: mateo.id } })).toBe(1);
  });

  it('RN-11: subir de nivel CNEB en una habilidad da +50 una sola vez por nivel', async () => {
    const subida = crearEvento(EVENTOS_INTEGRACION.MAESTRIA_NIVEL_SUBIDO, mateo.id, { estudianteId: mateo.id, habilidad: 'LIT', nivelAnterior: 'B', nivelNuevo: 'A' });
    await bus.publicar([subida]);
    await bus.publicar([crearEvento(EVENTOS_INTEGRACION.MAESTRIA_NIVEL_SUBIDO, mateo.id, { estudianteId: mateo.id, habilidad: 'LIT', nivelAnterior: 'B', nivelNuevo: 'A' })]);
    expect((await asientos()).filter((a) => a.motivo === 'SUBIDA_NIVEL_CNEB').map((a) => a.puntos)).toEqual([50]);
  });
});

describe('Insignias (RF-058, RN-13) y racha (RF-061)', () => {
  it('UAT-03: la quinta evidencia correcta otorga "Detective de Evidencias", una sola vez', async () => {
    for (let i = 0; i < 5; i++) await bus.publicar([itemSintetico(mateo.id, { modalidad: 'EVIDENCIA' })]);
    const v = (await pasaporte().expect(200)).body;
    expect(insignia(v, 'DETECTIVE_EVIDENCIAS')).toMatchObject({ ganada: true, avance: 5, meta: 5 });
    expect(await t.prisma.insigniaOtorgada.count({ where: { estudianteId: mateo.id, insignia: { codigo: 'DETECTIVE_EVIDENCIAS' } } })).toBe(1);
  });

  it('"Maestro de las Inferencias" pide el nivel Destacado declarado (RN-08: con 5 ítems o más)', async () => {
    const maestria = (valorNuevo: number, itemsContados: number) =>
      crearEvento(EVENTOS_INTEGRACION.MAESTRIA_ACTUALIZADA, mateo.id, { estudianteId: mateo.id, habilidad: 'INF', valorAnterior: 80, valorNuevo, itemsContados });
    await bus.publicar([maestria(90, 4)]);
    expect(insignia((await pasaporte()).body, 'MAESTRO_INFERENCIAS')!.ganada).toBe(false);
    await bus.publicar([maestria(90, 6), maestria(92, 7)]);
    expect(insignia((await pasaporte()).body, 'MAESTRO_INFERENCIAS')!.ganada).toBe(true);
    expect(await t.prisma.insigniaOtorgada.count({ where: { estudianteId: mateo.id, insignia: { codigo: 'MAESTRO_INFERENCIAS' } } })).toBe(1);
  });

  it('SAD §6: completar un mundo del mapa otorga su insignia de rango', async () => {
    await bus.publicar([crearEvento('aventura.MundoDesbloqueado', mateo.id, { estudianteId: mateo.id, mundoCompletado: 2, mundoDesbloqueado: 3 })]);
    const v = (await pasaporte()).body;
    expect(insignia(v, 'RANGO_DETECTIVE')!.ganada).toBe(true);
    expect(insignia(v, 'RANGO_EXPLORADOR')!.ganada).toBe(false);
  });

  it('RF-061: el comodín semanal cubre un día sin leer; a los 7 días suma +30 y "Lector Perseverante"', async () => {
    // Llevaba 6 días hasta anteayer; ayer no leyó.
    await t.prisma.racha.update({ where: { estudianteId: mateo.id }, data: { diasActuales: 6, mejorRacha: 6, ultimaFechaLima: diaAntes(2), comodinUsadoSemana: null } });
    expect((await pasaporte()).body.racha).toMatchObject({ dias: 6, leyoHoy: false });
    await leer(mateo.token, bosque); // repetición: también es un día con lectura
    const fila = await t.prisma.racha.findUniqueOrThrow({ where: { estudianteId: mateo.id } });
    expect(fila).toMatchObject({ diasActuales: 7, mejorRacha: 7 });
    const ayer = diaAntes(1).toISOString().slice(0, 10);
    expect(fila.comodinUsadoSemana?.toISOString().slice(0, 10)).toBe(lunesDeLaSemana(ayer));
    expect((await asientos()).filter((a) => a.motivo === 'RACHA_7').map((a) => a.puntos)).toEqual([30]);
    const v = (await pasaporte()).body;
    expect(v.racha).toMatchObject({ dias: 7, mejor: 7, leyoHoy: true, comodinDisponible: lunesDeLaSemana(ayer) !== lunesDeLaSemana(hoy()) });
    expect(insignia(v, 'LECTOR_PERSEVERANTE')).toMatchObject({ ganada: true, avance: 7, meta: 7 });
  });

  it('RF-061: sin comodín, pasar un día sin leer reinicia la racha', async () => {
    await t.prisma.racha.update({ where: { estudianteId: mateo.id }, data: { diasActuales: 7, ultimaFechaLima: diaAntes(3) } });
    expect((await pasaporte()).body.racha.dias).toBe(0);
    await leer(mateo.token, killa);
    expect(await t.prisma.racha.findUniqueOrThrow({ where: { estudianteId: mateo.id } })).toMatchObject({ diasActuales: 1, mejorRacha: 7 });
  });

  it('RN-13: el libro de puntos, las insignias otorgadas y los canjes solo admiten agregar', async () => {
    const [primero] = await asientos();
    await expect(t.prisma.asientoPuntos.update({ where: { id: primero!.id }, data: { puntos: 999 } })).rejects.toThrow(/solo admite agregar/);
    await expect(t.prisma.insigniaOtorgada.deleteMany({ where: { estudianteId: mateo.id } })).rejects.toThrow(/solo admite agregar/);
    await expect(t.prisma.$executeRaw`INSERT INTO gamificacion.asiento_puntos (estudiante_id, puntos, motivo, evento_origen, fecha_lima) VALUES (${mateo.id}::uuid, -5, 'ITEM_CORRECTO', ${uuidV7()}::uuid, CURRENT_DATE)`).rejects.toThrow(/ck_asiento_puntos/);
    await expect(t.prisma.$executeRaw`INSERT INTO gamificacion.asiento_puntos (estudiante_id, puntos, motivo, evento_origen, fecha_lima) VALUES (${mateo.id}::uuid, 5, 'REGALO', ${uuidV7()}::uuid, CURRENT_DATE)`).rejects.toThrow(/ck_asiento_motivo/);
  });
});

describe('Tope diario (RN-12)', () => {
  it('aunque lleguen 40 aciertos a la vez, Lía no pasa de 300 puntos en el día', async () => {
    await Promise.all(Array.from({ length: 40 }, () => bus.publicar([itemSintetico(lia.id)])));
    expect(await total(lia.id)).toBe(300);
    expect(await t.prisma.asientoPuntos.count({ where: { estudianteId: lia.id } })).toBe(30);
    await bus.publicar([itemSintetico(lia.id)]);
    expect(await total(lia.id)).toBe(300);
    expect((await pasaporte(lia.token)).body).toMatchObject({ puntos: { total: 300, hoy: 300 }, nivel: { actual: 2, desde: 300, hasta: 600 }, monedas: 30 });
  });
});

describe('Recompensas (RF-062)', () => {
  const recompensa = async (codigo: string) => (await t.prisma.recompensa.findUniqueOrThrow({ where: { codigo } })).id;
  const canjear = (id: string, token = lia.token) => t.http().post(`${API}/yo/recompensas/${id}/canje`).set(bearer(token));

  it('canjear descuenta monedas, nunca puntos de nivel; cada recompensa se canjea una vez', async () => {
    const r = (await canjear(await recompensa('LLAMA')).expect(201)).body;
    expect(r).toEqual({ recompensa: 'LLAMA', monedas: 10 });
    const v = (await pasaporte(lia.token)).body;
    expect(v).toMatchObject({ puntos: { total: 300 }, nivel: { actual: 2 }, monedas: 10 });
    expect(v.recompensas.find((x: { codigo: string }) => x.codigo === 'LLAMA')).toMatchObject({ tuya: true });
    expect((await canjear(await recompensa('LLAMA')).expect(409)).body.detail).toBe('Esta recompensa ya es tuya');
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'gamificacion.RecompensaCanjeada', agregadoId: lia.id } })).toBe(1);
  });

  it('sin monedas suficientes no se canjea, y dos canjes a la vez no gastan de más', async () => {
    expect((await canjear(await recompensa('DRAGON')).expect(409)).body.detail).toBe('Te faltan 50 monedas para esta recompensa');
    const [a, b] = await Promise.all([canjear(await recompensa('CORONA')), canjear(await recompensa('CAPA'))]); // 25 y 15 con 10 monedas
    expect([a.status, b.status]).toEqual([409, 409]);
    const otras = await Promise.all([canjear(await recompensa('LUPA')), canjear(await recompensa('GORRA'))]); // 5 + 8 > 10
    expect(otras.map((x) => x.status).sort()).toEqual([201, 409]);
    const gastadas = (await t.prisma.canjeRecompensa.findMany({ where: { estudianteId: lia.id } })).reduce((s, c) => s + c.monedas, 0);
    expect(gastadas).toBeLessThanOrEqual(30);
    await expect(t.prisma.canjeRecompensa.deleteMany({ where: { estudianteId: lia.id } })).rejects.toThrow(/solo admite agregar/);
  });

  it('una recompensa que no existe responde 404', async () => {
    await canjear('no-es-un-id').expect(404);
    await canjear(uuidV7()).expect(404);
  });
});

describe('Acceso (RNF-012)', () => {
  it('solo el estudiante ve su pasaporte, su reto y canjea', async () => {
    await t.http().get(`${API}/yo/pasaporte`).expect(401);
    await t.http().get(`${API}/yo/pasaporte`).set(bearer(tokenDocente)).expect(403);
    await t.http().get(`${API}/yo/reto-del-dia`).set(bearer(editora)).expect(403);
    await t.http().post(`${API}/yo/recompensas/${uuidV7()}/canje`).set(bearer(tokenDocente)).expect(403);
  });
});
