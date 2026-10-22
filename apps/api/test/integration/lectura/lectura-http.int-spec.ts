import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { ordenMostrado } from '../../../src/modules/lectura/domain/services/correccion';
import { AVANCE_LECTURAS, RegistroAvanceLecturas, uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Lectura interactiva integrada (RF-038 a RF-051) contra PostgreSQL real: una lectura
 * publicada por el flujo real de Contenido, leída por un niño en la API (predicción, preguntas con
 * anclaje, pistas, evidencia, historia ramificada, ordenar, selección múltiple, escritura con filtro,
 * defensa y cierre), reanudación con versión nueva y la revisión docente con rúbrica.
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';
const TEXTO = 'Killa vivía en Puno. Cada mañana cuidaba a su llama Pancho.\nUn día Pancho no quiso comer. Killa vio que tenía una espina en la pata.\nCon cuidado le quitó la espina. Pancho comió feliz y Killa sonrió.';

let t: AppDePrueba;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
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
  return login.body.accessToken as string;
}

async function docente() {
  const email = `docente.${uuidV7().slice(-6)}@lectoaventura.test`;
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Pérez', email, contrasena: CONTRASENA, rol: 'DOCENTE' }).expect(201);
  const enlace = ((await t.http().get(`${API}/dev/correos`)).body as { para: string; enlace: string }[]).find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  return (await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200)).body.accessToken as string;
}

const pista = (nivel: string, texto: string) => ({ nivel, texto });

/** Las actividades de "Killa y la llama": una de cada modalidad (RF-024). */
function actividadesKilla(o: string[]) {
  return [
    { momento: 'ANTES', tipo: 'PREDICCION', items: [{ habilidad: 'INF', nivelDificultad: 1, modalidad: 'ESCRITURA', enunciado: '¿Qué crees que le pasará a la llama?', explicacionModelada: 'Al leer comprobarás tu idea.' }] },
    {
      momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: o[2],
      items: [{
        habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1,
        explicacionModelada: 'Más adelante el texto dice que tenía una espina en la pata: le dolía.',
        pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.'), pista('P2', 'Mira el segundo párrafo.'), pista('P3', '¿Cómo se siente alguien que no quiere comer?')],
      }],
    },
    {
      momento: 'DURANTE', tipo: 'EVIDENCIA', oracionAnclajeId: o[3],
      items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Toca la oración que dice qué tenía Pancho.', clavesEvidencia: [o[3]], explicacionModelada: 'La oración de la espina lo dice.', pistas: [pista('P1', 'Busca en el segundo párrafo.')] }],
    },
    {
      momento: 'DESPUES', tipo: 'ORDENAMIENTO',
      items: [{ habilidad: 'LIT', nivelDificultad: 2, modalidad: 'ORDENAMIENTO', enunciado: 'Ordena lo que pasó.', elementos: ['Pancho no quiso comer', 'Killa vio la espina', 'Killa le quitó la espina'], explicacionModelada: 'Primero no comió, luego Killa miró y al final lo curó.', pistas: [pista('P1', 'Piensa qué pasó primero.')] }],
    },
    {
      momento: 'DESPUES', tipo: 'SELECCION',
      items: [{ habilidad: 'CRI', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: '¿Qué hizo bien Killa? Marca todas.', opciones: ['Miró con atención', 'Se fue a jugar', 'Lo ayudó con cuidado'], indicesCorrectos: [0, 2], explicacionModelada: 'Killa miró la pata y quitó la espina con cuidado.', pistas: [pista('P1', 'Recuerda lo que hizo cuando Pancho no comía.')] }],
    },
    { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 3, modalidad: 'ESCRITURA', enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', minPalabras: 3, explicacionModelada: 'Sí: así encontró la espina.' }] },
    {
      momento: 'DESPUES', tipo: 'DEFIENDE',
      items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'SELECCION', enunciado: '¿Qué razón defiende mejor tu respuesta?', opciones: ['El texto dice que tenía una espina', 'A las llamas no les gusta comer'], indiceCorrecto: 0, explicacionModelada: 'La razón está en el texto.', pistas: [pista('P1', 'Busca la razón en lo que leíste.')] }],
    },
  ];
}

const NODOS = [
  { clave: 'inicio', contenido: 'Killa puede llevar a Pancho al río o al cerro.', esInicio: true, opciones: [{ texto: 'Ir al río', destino: 'rio' }, { texto: 'Subir al cerro', destino: 'cerro' }] },
  { clave: 'rio', contenido: 'En el río, Pancho bebió agua fresca. ¡Qué feliz estaba!', esFinal: true },
  { clave: 'cerro', contenido: 'En el cerro vieron un cóndor volar.', esFinal: true },
];

/** Lectura publicada por el flujo real de Contenido (editora → revisora). */
async function publicar(p: { titulo: string; rangoEdad: 'R1' | 'R2' | 'R3'; completa?: boolean }) {
  const { lecturaId, oraciones } = (
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora)).send({
      metadatos: { titulo: p.titulo, rangoEdad: p.rangoEdad, nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF', 'ARG'], licencia: 'CC BY 4.0' },
      texto: TEXTO,
    }).expect(201)
  ).body as { lecturaId: string; oraciones: { id: string }[] };
  const o = oraciones.map((x) => x.id);
  const actividades = p.completa
    ? actividadesKilla(o)
    : [{ momento: 'DESPUES', tipo: 'SELECCION', items: [{ habilidad: 'LIT', nivelDificultad: 1, modalidad: 'SELECCION', enunciado: '¿Dónde vivía Killa?', opciones: ['En Puno', 'En Lima'], indiceCorrecto: 0, explicacionModelada: 'La primera oración lo dice.', pistas: [pista('P1', 'Mira la primera oración.')] }] }];
  await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora)).send({ actividades }).expect(200);
  if (p.completa) await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/grafo`).set(bearer(editora)).send({ nodos: NODOS }).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora)).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisora)).expect(200);
  return { lecturaId, o };
}

let editora: string;
let revisora: string;
let tokenDocente: string;
let aulaId: string;
const ninos = {} as Record<'mateo' | 'lia', { id: string; token: string }>;
let killa: { lecturaId: string; o: string[] };
let toby: { lecturaId: string; o: string[] };
let sesion: string;

const outbox = (tipo: string) => t.prisma.outboxEvento.count({ where: { tipo } });
/** Una respuesta nueva (cada envío con su propia clave de idempotencia). */
const responder = (cuerpo: Record<string, unknown>) =>
  t.http().post(`${API}/sesiones-lectura/${sesion}/respuestas`).set(bearer(ninos.mateo.token)).send({ idempotencyKey: uuidV7(), ...cuerpo });

describe('Preparación', () => {
  it('editora y revisora publican; una docente con Mateo (9 años) y Lía (6 años) en la tablet del aula', async () => {
    editora = await backoffice('EDITOR');
    revisora = await backoffice('REVISOR');
    killa = await publicar({ titulo: 'Killa y la llama', rangoEdad: 'R2', completa: true });
    toby = await publicar({ titulo: 'Toby en Puno', rangoEdad: 'R1' });
    tokenDocente = await docente();
    aulaId = (await t.http().post(`${API}/aulas`).set(bearer(tokenDocente)).send({
      nombre: '4.° A', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body.id;
    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(tokenDocente)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    const anio = new Date().getFullYear();
    for (const [clave, alias, edad] of [['mateo', 'Mateo', 9], ['lia', 'Lía', 6]] as const) {
      const m = (await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(tokenDocente)).send({ alias, anioNacimiento: anio - edad, mesNacimiento: 1, avatar: 'zorro' }).expect(201)).body;
      await t.http().post(`${API}/estudiantes/${m.estudianteId}/pin/restablecer`).set(bearer(tokenDocente)).send({ pinNuevo: '4826' }).expect(200);
      ninos[clave] = { id: m.estudianteId, token: (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: m.estudianteId, pin: '4826' }).expect(200)).body.accessToken };
    }
  });
});

describe('La lectura de Mateo de punta a punta', () => {
  it('RF-038: empieza en la predicción, sin texto ni preguntas; antes de predecir no se responde', async () => {
    const v = (await t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.mateo.token)).send({ lecturaId: killa.lecturaId }).expect(201)).body;
    sesion = v.id;
    expect(v).toMatchObject({ fase: 'PREDICCION', estado: 'INICIADA', pregunta: null, texto: { parrafos: [], completo: false }, prediccion: { enunciado: '¿Qué crees que le pasará a la llama?', respuesta: null } });
    expect(v.lectura).toMatchObject({ titulo: 'Killa y la llama', rangoEdad: 'R2', leerEnVozAlta: false });
    expect(await outbox('lectura.SesionLecturaIniciada')).toBe(1);
    await responder({ itemId: uuidV7(), indice: 0 }).expect(409);
  });

  it('RF-038, RF-039: al predecir se abre el texto hasta la oración de anclaje, con su pregunta', async () => {
    const v = (await t.http().put(`${API}/sesiones-lectura/${sesion}/prediccion`).set(bearer(ninos.mateo.token)).send({ texto: 'Creo que la llama se enfermará' }).expect(200)).body;
    expect(v).toMatchObject({ fase: 'LECTURA', estado: 'EN_CURSO', prediccion: { respuesta: 'Creo que la llama se enfermará' }, progreso: { hechas: 0, total: 6 } });
    expect(v.texto.parrafos.flatMap((p: { oraciones: { id: string }[] }) => p.oraciones.map((x) => x.id))).toEqual(killa.o.slice(0, 3));
    expect(v.pregunta).toMatchObject({ numero: 1, total: 6, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', anclajeOracionId: killa.o[2], pistas: [], pistasRestantes: 3 });
    await t.http().put(`${API}/sesiones-lectura/${sesion}/prediccion`).set(bearer(ninos.mateo.token)).send({ texto: 'Otra' }).expect(409);
  });

  it('RF-040, RF-045, RF-046: corrige en el servidor, da P1 sin la respuesta, y reenviar no vuelve a corregir', async () => {
    const pregunta = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body.pregunta;
    const clave = uuidV7();
    const mal = await t.http().post(`${API}/sesiones-lectura/${sesion}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: pregunta.itemId, idempotencyKey: clave, indice: 0 }).expect(200);
    expect(mal.body).toMatchObject({ resultado: 'INCORRECTA', pista: { nivel: 'P1', texto: 'Vuelve a la oración que acabas de leer.', parrafo: null }, explicacion: null, filtrado: false });
    expect(JSON.stringify(mal.body)).not.toMatch(/indiceCorrecto|respuestaCorrecta|indicesCorrectos|clavesEvidencia|explicacionModelada/);
    const otraVez = await t.http().post(`${API}/sesiones-lectura/${sesion}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: pregunta.itemId, idempotencyKey: clave, indice: 0 }).expect(200);
    expect(otraVez.body.pista).toEqual(mal.body.pista);
    expect(await t.prisma.usoPista.count()).toBe(1);

    const bien = (await responder({ itemId: pregunta.itemId, indice: 1 }).expect(200)).body;
    expect(bien).toMatchObject({ resultado: 'CORRECTA', pista: null, sesion: { pregunta: { modalidad: 'EVIDENCIA' } } });
    const fila = await t.prisma.respuesta.findFirstOrThrow({ where: { itemId: pregunta.itemId } });
    expect(fila).toMatchObject({ esCorrecta: true, pistasUsadas: 1, estado: 'ENVIADA' });
    expect(Number(fila.puntajeItem)).toBe(0.75); // RN-07
    const evento = await t.prisma.outboxEvento.findFirstOrThrow({ where: { tipo: 'lectura.ItemRespondido' } });
    expect(evento.payload).toMatchObject({ estudianteId: ninos.mateo.id, lecturaId: killa.lecturaId, habilidad: 'INF', nivelDificultad: 3, puntajeItem: 0.75 });
  });

  it('RF-039: no se responde lo que aún no está en pantalla', async () => {
    await responder({ itemId: uuidV7(), indice: 0 }).expect(409);
  });

  it('RF-043: la evidencia es correcta con una oración de la clave y como mucho una ajena', async () => {
    const v = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(v.texto.parrafos.flatMap((p: { oraciones: unknown[] }) => p.oraciones)).toHaveLength(4);
    await responder({ itemId: v.pregunta.itemId, oraciones: [killa.o[5]] }).expect(400); // aún no la leyó
    const r = (await responder({ itemId: v.pregunta.itemId, oraciones: [killa.o[3], killa.o[0]] }).expect(200)).body;
    expect(r.resultado).toBe('CORRECTA');
    expect(r.sesion).toMatchObject({ fase: 'HISTORIA', pregunta: null, texto: { completo: true }, historia: { nodo: { opciones: ['Ir al río', 'Subir al cerro'], esFinal: false } } });
  });

  it('RF-048: la decisión se registra y lleva al nodo siguiente', async () => {
    const v = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body;
    await t.http().post(`${API}/sesiones-lectura/${sesion}/decisiones`).set(bearer(ninos.mateo.token)).send({ nodoId: uuidV7(), opcion: 0 }).expect(409);
    const tras = (await t.http().post(`${API}/sesiones-lectura/${sesion}/decisiones`).set(bearer(ninos.mateo.token)).send({ nodoId: v.historia.nodo.id, opcion: 0 }).expect(200)).body;
    expect(tras).toMatchObject({ fase: 'DESPUES', historia: { nodo: { contenido: 'En el río, Pancho bebió agua fresca. ¡Qué feliz estaba!', esFinal: true }, recorrido: [{ eleccion: 'Ir al río' }] }, pregunta: { modalidad: 'ORDENAMIENTO' } });
    expect(await t.prisma.decisionRuta.count({ where: { sesionId: sesion } })).toBe(1);
  });

  it('RF-042, RF-040: ordenar (con los elementos mezclados) y selección múltiple', async () => {
    const v = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(v.pregunta.elementos).not.toEqual(['Pancho no quiso comer', 'Killa vio la espina', 'Killa le quitó la espina']);
    const mostrado = ordenMostrado(3, `${sesion}:${v.pregunta.itemId}`);
    const r = (await responder({ itemId: v.pregunta.itemId, orden: [0, 1, 2].map((k) => mostrado.indexOf(k)) }).expect(200)).body;
    expect(r.resultado).toBe('CORRECTA');
    expect(r.sesion.pregunta).toMatchObject({ modalidad: 'SELECCION', multiple: true });
    expect((await responder({ itemId: r.sesion.pregunta.itemId, indices: [2, 0] }).expect(200)).body.resultado).toBe('CORRECTA');
  });

  it('RF-041: la escritura admite hasta 500 caracteres, pide el mínimo de palabras y filtra lo no apropiado', async () => {
    const itemId = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body.pregunta.itemId;
    await responder({ itemId, texto: 'a'.repeat(501) }).expect(400);
    expect((await responder({ itemId, texto: 'Sí, idiota' }).expect(400)).body.detail).toMatch(/al menos 3 palabras/);
    const r = (await responder({ itemId, texto: 'Sí, porque le dolía mucho, idiota' }).expect(200)).body;
    expect(r).toMatchObject({ resultado: 'ENVIADA', filtrado: true });
    expect((await t.prisma.respuesta.findFirstOrThrow({ where: { itemId } })).contenido).toEqual({ texto: 'Sí, porque le dolía mucho, ******', porVoz: false });
  });

  it('RF-044: defiende su respuesta y la defensa queda asociada a la original', async () => {
    const v = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(v.pregunta).toMatchObject({ tipo: 'DEFIENDE', defiende: { enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', respuesta: 'Sí, porque le dolía mucho, ******' } });
    await t.http().post(`${API}/sesiones-lectura/${sesion}/finalizar`).set(bearer(ninos.mateo.token)).send({ reflexion: 'Aún no' }).expect(409);
    expect((await responder({ itemId: v.pregunta.itemId, indice: 0 }).expect(200)).body.sesion.fase).toBe('CIERRE');
    const j = await t.prisma.justificacion.findFirstOrThrow();
    expect(j).toMatchObject({ modalidad: 'SELECCION', opcionElegida: { indices: [0], texto: 'El texto dice que tenía una espina' } });
  });

  it('RF-047: el cierre contrasta predicción y desenlace; al terminar, lo abierto pasa a revisión y Aventura sabe que terminó', async () => {
    const v = (await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.mateo.token)).expect(200)).body;
    expect(v.cierre).toEqual({ prediccion: 'Creo que la llama se enfermará', desenlace: 'En el río, Pancho bebió agua fresca. ¡Qué feliz estaba!', pregunta: expect.stringContaining('Se parece') });
    await t.http().post(`${API}/sesiones-lectura/${sesion}/finalizar`).set(bearer(ninos.mateo.token)).send({ reflexion: '   ' }).expect(400);
    const fin = (await t.http().post(`${API}/sesiones-lectura/${sesion}/finalizar`).set(bearer(ninos.mateo.token)).send({ reflexion: 'Pensé que se enfermaba, pero tenía una espina' }).expect(200)).body;
    expect(fin).toMatchObject({ fase: 'FINALIZADA', resumen: { preguntas: 6, sinAyuda: 4, conPista: 1, conExplicacion: 0, abiertas: 1 } });
    expect(await t.prisma.sesionLectura.findUniqueOrThrow({ where: { id: sesion } })).toMatchObject({ estado: 'FINALIZADA', reflexion: 'Pensé que se enfermaba, pero tenía una espina' });
    expect(await t.prisma.respuesta.count({ where: { sesionId: sesion, estado: 'PENDIENTE_REVISION' } })).toBe(1);
    expect(await outbox('lectura.SesionLecturaFinalizada')).toBe(1);
    expect(await t.app.get<RegistroAvanceLecturas>(AVANCE_LECTURAS).avanceDe(ninos.mateo.id, [killa.lecturaId])).toEqual(new Map([[killa.lecturaId, 'FINALIZADA']]));
    await responder({ itemId: uuidV7(), indice: 0 }).expect(409);
  });
});

describe('Reanudar, acceso y lectura en voz alta', () => {
  it('RF-046, RF-027: al volver sigue la misma sesión con su versión, aunque se publique otra', async () => {
    const leer = () => t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.lia.token)).send({ lecturaId: toby.lecturaId }).expect(201);
    const v = (await leer()).body;
    expect(v.lectura.leerEnVozAlta).toBe(true); // RF-050: R1
    await t.http().put(`${API}/sesiones-lectura/${v.id}/prediccion`).set(bearer(ninos.lia.token)).send({ texto: 'Un perro en Puno' }).expect(200);
    const version1 = (await t.prisma.sesionLectura.findUniqueOrThrow({ where: { id: v.id } })).versionLecturaId;

    await t.http().post(`${API}/backoffice/lecturas/${toby.lecturaId}/nueva-version`).set(bearer(editora)).expect(201);
    await t.http().post(`${API}/backoffice/lecturas/${toby.lecturaId}/enviar-revision`).set(bearer(editora)).expect(200);
    await t.http().post(`${API}/backoffice/lecturas/${toby.lecturaId}/aprobar`).set(bearer(revisora)).expect(200);

    const otra = (await leer()).body;
    expect(otra).toMatchObject({ id: v.id, fase: 'DESPUES', pregunta: { enunciado: '¿Dónde vivía Killa?' } });
    expect((await t.prisma.sesionLectura.findUniqueOrThrow({ where: { id: v.id } })).versionLecturaId).toBe(version1);
  });

  it('cada niño lee lo de su edad (o lo que su docente le asignó) y nunca la sesión de otro', async () => {
    await t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.lia.token)).send({ lecturaId: killa.lecturaId }).expect(404);
    await t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.mateo.token)).send({ lecturaId: toby.lecturaId }).expect(404);
    await t.http().get(`${API}/sesiones-lectura/${sesion}`).set(bearer(ninos.lia.token)).expect(404);

    const hoy = new Date();
    const limite = new Date(hoy.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
    await t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(tokenDocente)).send({ tipo: 'LECTURA', contenidoId: toby.lecturaId, fechaLimite: limite }).expect(201);
    const [asignacion] = (await t.http().get(`${API}/yo/asignaciones`).set(bearer(ninos.mateo.token)).expect(200)).body;
    const v = (await t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.mateo.token)).send({ lecturaId: toby.lecturaId, asignacionId: asignacion.id }).expect(201)).body;
    expect((await t.prisma.sesionLectura.findUniqueOrThrow({ where: { id: v.id } })).asignacionId).toBe(asignacion.id);
  });

  it('valida la forma de las peticiones y que sean del rol correcto', async () => {
    await t.http().post(`${API}/sesiones-lectura`).set(bearer(ninos.mateo.token)).send({ lecturaId: 'no-es-uuid' }).expect(400);
    await t.http().post(`${API}/sesiones-lectura/${sesion}/respuestas`).set(bearer(ninos.mateo.token)).send({ itemId: uuidV7(), indice: 0 }).expect(400); // sin idempotencyKey
    await t.http().post(`${API}/sesiones-lectura`).set(bearer(tokenDocente)).send({ lecturaId: killa.lecturaId }).expect(403);
    await t.http().post(`${API}/sesiones-lectura`).send({ lecturaId: killa.lecturaId }).expect(401);
  });
});

describe('RF-051: revisión docente con rúbrica (RN-17)', () => {
  it('la docente ve la respuesta abierta de Mateo con su defensa y la valora una vez', async () => {
    const pendientes = (await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(tokenDocente)).expect(200)).body;
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]).toMatchObject({
      estado: 'PENDIENTE_REVISION',
      estudiante: { id: ninos.mateo.id, alias: 'Mateo' },
      lectura: { id: killa.lecturaId, titulo: 'Killa y la llama' },
      pregunta: { enunciado: '¿Fue buena idea revisar la pata de Pancho? ¿Por qué?', habilidad: 'ARG' },
      respuesta: 'Sí, porque le dolía mucho, ******',
      justificacion: 'El texto dice que tenía una espina',
      valoracion: null,
    });
    const id = pendientes[0].respuestaId;
    await t.http().post(`${API}/respuestas/${id}/valoracion`).set(bearer(tokenDocente)).send({ nivel: 4 }).expect(400);
    const valorada = (await t.http().post(`${API}/respuestas/${id}/valoracion`).set(bearer(tokenDocente)).send({ nivel: 3, comentario: '¡Bien explicado con el texto!' }).expect(200)).body;
    expect(valorada).toMatchObject({ estado: 'VALORADA', valoracion: { nivel: 3, comentario: '¡Bien explicado con el texto!' } });
    await t.http().post(`${API}/respuestas/${id}/valoracion`).set(bearer(tokenDocente)).send({ nivel: 2 }).expect(409);
    expect(Number((await t.prisma.respuesta.findUniqueOrThrow({ where: { id } })).puntajeItem)).toBe(1);
    expect(await t.prisma.valoracionRubrica.count()).toBe(1);
    expect(await outbox('lectura.RespuestaAbiertaValorada')).toBe(1);
    expect((await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(tokenDocente)).expect(200)).body).toEqual([]);
    expect((await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas?estado=VALORADA`).set(bearer(tokenDocente)).expect(200)).body).toHaveLength(1);
    await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas?estado=OTRO`).set(bearer(tokenDocente)).expect(400);
  });

  it('otra docente no ve el aula ni valora; el niño no tiene acceso', async () => {
    const otra = await docente();
    const id = (await t.prisma.respuesta.findFirstOrThrow({ where: { estado: 'VALORADA' } })).id;
    await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(otra)).expect(404);
    await t.http().post(`${API}/respuestas/${id}/valoracion`).set(bearer(otra)).send({ nivel: 1 }).expect(404);
    await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(ninos.mateo.token)).expect(403);
  });
});
