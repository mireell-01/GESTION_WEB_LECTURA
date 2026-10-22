import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { nivelLectura } from '../../../src/modules/progreso/domain/services/maestria';
import { BUS_EVENTOS, BusEventos, crearEvento, EVENTOS_INTEGRACION, uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Progreso integrado (RF-052 a RF-055) contra PostgreSQL real: el reto inicial real crea el
 * perfil, una lectura real mueve la maestría (y reintentar su evento no cuenta doble), la valoración
 * docente mueve ARG, y las recomendaciones juntan la asignación, la misión del mapa y la habilidad más
 * débil. Aventura (RN-09) y la biblioteca (RF-028) reciben la maestría y el nivel por el shared-kernel.
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

/** Una lectura de 8–9 años publicada por el flujo real; `completa`: con una pregunta de inferencia y una abierta. */
async function publicar(titulo: string, habilidades: string[], nivelDificultad: number, completa = false) {
  const { lecturaId, oraciones } = (
    await t.http().post(`${API}/backoffice/lecturas`).set(bearer(editora)).send({
      metadatos: { titulo, rangoEdad: 'R2', nivelDificultad, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: habilidades, licencia: 'CC BY 4.0' },
      texto: TEXTO,
    }).expect(201)
  ).body as { lecturaId: string; oraciones: { id: string }[] };
  const actividades = completa
    ? [
        {
          momento: 'DURANTE', tipo: 'SELECCION', oracionAnclajeId: oraciones[2]!.id,
          items: [{ habilidad: 'INF', nivelDificultad: 3, modalidad: 'SELECCION', enunciado: '¿Por qué Pancho no quiso comer?', opciones: ['Estaba feliz', 'Le dolía algo', 'Tenía sueño'], indiceCorrecto: 1, explicacionModelada: 'Tenía una espina.', pistas: [pista('P1', 'Vuelve a la oración que acabas de leer.')] }],
        },
        { momento: 'DESPUES', tipo: 'ESCRITURA', items: [{ habilidad: 'ARG', nivelDificultad: 2, modalidad: 'ESCRITURA', enunciado: '¿Fue buena idea revisar la pata?', explicacionModelada: 'Sí.' }] },
      ]
    : [{ momento: 'DESPUES', tipo: 'SELECCION', items: [{ habilidad: habilidades[0], nivelDificultad: 1, modalidad: 'SELECCION', enunciado: '¿Dónde vivía Killa?', opciones: ['En Puno', 'En Lima'], indiceCorrecto: 0, explicacionModelada: 'Lo dice el texto.', pistas: [pista('P1', 'Mira la primera oración.')] }] }];
  await t.http().put(`${API}/backoffice/lecturas/${lecturaId}/actividades`).set(bearer(editora)).send({ actividades }).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/enviar-revision`).set(bearer(editora)).expect(200);
  await t.http().post(`${API}/backoffice/lecturas/${lecturaId}/aprobar`).set(bearer(revisora)).expect(200);
  return lecturaId;
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
  return id as string;
}

let editora: string;
let revisora: string;
let tokenDocente: string;
let aulaId: string;
let mateo: { id: string; token: string };
let lia: { id: string; token: string };
const lecturas = {} as Record<'killa' | 'inf' | 'lit' | 'asignada' | 'mision', string>;

const perfil = (token = mateo.token) => t.http().get(`${API}/yo/perfil-lector`).set(bearer(token));
const maestria = (habilidad: string) => t.prisma.maestriaHabilidad.findUniqueOrThrow({ where: { estudianteId_habilidad: { estudianteId: mateo.id, habilidad } } });

describe('Preparación', () => {
  it('lecturas publicadas y una docente con Mateo (9 años) y Lía (6 años) en la tablet del aula', async () => {
    editora = await backoffice('EDITOR');
    revisora = await backoffice('REVISOR');
    lecturas.killa = await publicar('Killa y la llama', ['INF', 'ARG'], 2, true);
    lecturas.inf = await publicar('Pistas en el bosque', ['INF'], 1);
    lecturas.lit = await publicar('El mercado de Puno', ['LIT'], 1);
    lecturas.asignada = await publicar('La lectura de la profe', ['CRI'], 3);
    lecturas.mision = await publicar('La misión del cóndor', ['VOC'], 2);
    tokenDocente = await docente();
    aulaId = (await t.http().post(`${API}/aulas`).set(bearer(tokenDocente)).send({
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

describe('Perfil lector (RF-052, RF-053, RF-054)', () => {
  it('sin reto inicial, las 5 habilidades están por descubrir y no hay nada guardado', async () => {
    const v = (await perfil().expect(200)).body;
    expect(v).toMatchObject({ conDatos: false, nivelLectura: null, actualizadoEn: null });
    expect(v.habilidades.map((h: { codigo: string; etiqueta: string }) => `${h.codigo}:${h.etiqueta}`)).toEqual(['LIT:Aún descubriendo', 'INF:Aún descubriendo', 'VOC:Aún descubriendo', 'CRI:Aún descubriendo', 'ARG:Aún descubriendo']);
    expect(await t.prisma.maestriaHabilidad.count({ where: { estudianteId: mateo.id } })).toBe(0);
  });

  it('el reto inicial real crea el perfil con su nivel por habilidad (SAD §6: DiagnosticoFinalizado)', async () => {
    const id = await retoInicial(mateo.token, ['LIT', 'VOC']);
    const resultado = (await t.prisma.diagnostico.findUniqueOrThrow({ where: { id } })).resultado as { habilidades: Record<string, { valor: number; items: number }> };
    const filas = await t.prisma.maestriaHabilidad.findMany({ where: { estudianteId: mateo.id } });
    expect(filas).toHaveLength(5);
    for (const f of filas) expect({ h: f.habilidad, valor: Number(f.valor), items: f.itemsContados }).toEqual({ h: f.habilidad, valor: resultado.habilidades[f.habilidad]!.valor, items: resultado.habilidades[f.habilidad]!.items });
    expect(await t.prisma.historialMaestria.count({ where: { estudianteId: mateo.id, origen: 'DIAGNOSTICO', origenId: id } })).toBe(5);
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'progreso.PerfilLectorIniciado', agregadoId: mateo.id } })).toBe(1);
    const v = (await perfil().expect(200)).body;
    expect(v.conDatos).toBe(true);
    expect(v.habilidades.find((h: { codigo: string }) => h.codigo === 'LIT').valor).toBeGreaterThanOrEqual(65);
  });

  it('RF-053: un ítem cerrado en la lectura mueve la maestría con RN-07; reintentar el evento no cuenta doble', async () => {
    const antes = await maestria('INF');
    const s = (await t.http().post(`${API}/sesiones-lectura`).set(bearer(mateo.token)).send({ lecturaId: lecturas.killa }).expect(201)).body;
    const v = (await t.http().put(`${API}/sesiones-lectura/${s.id}/prediccion`).set(bearer(mateo.token)).send({ texto: 'Se enfermará' }).expect(200)).body;
    const responder = (cuerpo: object) => t.http().post(`${API}/sesiones-lectura/${s.id}/respuestas`).set(bearer(mateo.token)).send({ itemId: v.pregunta.itemId, idempotencyKey: uuidV7(), ...cuerpo }).expect(200);
    await responder({ indice: 0 }); // con P1
    expect(Number((await maestria('INF')).valor)).toBe(Number(antes.valor)); // aún no se cierra
    await responder({ indice: 1 });
    const despues = await maestria('INF');
    // 0,75 × (0,8 + 0,1 × 3) × 100 = 82,5 · EMA α = 0,3
    expect(Number(despues.valor)).toBeCloseTo(Math.round((0.3 * 82.5 + 0.7 * Number(antes.valor)) * 100) / 100, 2);
    expect(despues).toMatchObject({ itemsContados: antes.itemsContados + 1, version: antes.version + 1 });
    const evento = await t.prisma.outboxEvento.findFirstOrThrow({ where: { tipo: 'lectura.ItemRespondido', agregadoId: s.id } });
    expect(await t.prisma.historialMaestria.count({ where: { origen: 'ITEM', origenId: (evento.payload as { respuestaId: string }).respuestaId } })).toBe(1);
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'progreso.MaestriaActualizada', agregadoId: mateo.id } })).toBe(1);

    // El outbox reintenta el mismo evento: Progreso ya lo aplicó.
    await t.app.get<BusEventos>(BUS_EVENTOS).publicar([crearEvento(EVENTOS_INTEGRACION.ITEM_RESPONDIDO, s.id, evento.payload as object)]);
    expect(await maestria('INF')).toMatchObject({ itemsContados: despues.itemsContados, version: despues.version });

    // Termina la lectura con su respuesta abierta (aún no cuenta: RN-19).
    const arg = await maestria('ARG');
    const s2 = (await t.http().get(`${API}/sesiones-lectura/${s.id}`).set(bearer(mateo.token)).expect(200)).body;
    await t.http().post(`${API}/sesiones-lectura/${s.id}/respuestas`).set(bearer(mateo.token)).send({ itemId: s2.pregunta.itemId, idempotencyKey: uuidV7(), texto: 'Sí, porque encontró la espina' }).expect(200);
    await t.http().post(`${API}/sesiones-lectura/${s.id}/finalizar`).set(bearer(mateo.token)).send({ reflexion: 'Pensé otra cosa' }).expect(200);
    expect(await maestria('ARG')).toMatchObject({ itemsContados: arg.itemsContados });
  });

  it('RN-19: la valoración docente de la respuesta abierta mueve ARG', async () => {
    const antes = await maestria('ARG');
    const [r] = (await t.http().get(`${API}/aulas/${aulaId}/respuestas-abiertas`).set(bearer(tokenDocente)).expect(200)).body;
    await t.http().post(`${API}/respuestas/${r.respuestaId}/valoracion`).set(bearer(tokenDocente)).send({ nivel: 3 }).expect(200);
    const despues = await maestria('ARG');
    // 1 × (0,8 + 0,1 × 2) × 100 = 100
    expect(Number(despues.valor)).toBeCloseTo(Math.round((0.3 * 100 + 0.7 * Number(antes.valor)) * 100) / 100, 2);
    expect(despues.itemsContados).toBe(antes.itemsContados + 1);
    expect(await t.prisma.historialMaestria.count({ where: { origen: 'VALORACION', origenId: r.respuestaId } })).toBe(1);
  });

  it('el perfil muestra el nivel CNEB solo con 5 ítems (RN-08) y su nivel de lectura', async () => {
    const v = (await perfil().expect(200)).body;
    const inf = v.habilidades.find((h: { codigo: string }) => h.codigo === 'INF');
    expect(inf).toMatchObject({ itemsContados: 4, nivel: null, etiqueta: 'Aún descubriendo' });
    const filas = await t.prisma.maestriaHabilidad.findMany({ where: { estudianteId: mateo.id } });
    const promedio = filas.reduce((s, f) => s + Number(f.valor), 0) / 5;
    expect(v.nivelLectura).toBe(nivelLectura('R2', promedio));
  });
});

describe('El resto de la plataforma recibe la maestría y el nivel', () => {
  it('RF-028: la biblioteca muestra su nivel ± 1 (antes partía del típico de su edad)', async () => {
    const nivel = (await perfil().expect(200)).body.nivelLectura as number;
    const { alcance } = (await t.http().get(`${API}/biblioteca`).set(bearer(mateo.token)).expect(200)).body;
    expect(alcance).toEqual({ rangoEdad: 'R2', niveles: [nivel - 1, nivel, nivel + 1].filter((n) => n >= 1 && n <= 5) });
  });

  it('RN-09: el mapa de Aventura ve la maestría real de las habilidades foco', async () => {
    const mapa = (await t.http().get(`${API}/aventura/mapa`).set(bearer(mateo.token)).expect(200)).body;
    const detective = mapa.mundos.find((m: { numero: number }) => m.numero === 2);
    const voc = Number((await maestria('VOC')).valor);
    expect(detective.habilidadesFoco.find((h: { codigo: string }) => h.codigo === 'VOC').maestria).toBe(voc);
    expect(mapa.mundoActual).toBe(2);
  });
});

describe('Recomendaciones (RF-055, RN-20)', () => {
  it('sin asignación ni misión, recomienda para su habilidad más débil; nunca más de 3', async () => {
    const r = (await t.http().get(`${API}/yo/recomendaciones`).set(bearer(mateo.token)).expect(200)).body;
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r.length).toBeLessThanOrEqual(3);
    expect(r[0]).toMatchObject({ prioridad: 1, lectura: { id: expect.any(String) } });
    expect(r.some((x: { lectura: { id: string } | null }) => x.lectura?.id === lecturas.killa)).toBe(false); // ya la terminó
  });

  it('con asignación de la docente y misión en curso, van en ese orden y quedan vigentes', async () => {
    const limite = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(tokenDocente)).send({ tipo: 'LECTURA', contenidoId: lecturas.asignada, fechaLimite: limite }).expect(201);
    const mundo2 = await t.prisma.mundo.findUniqueOrThrow({ where: { numero: 2 } });
    await t.http().post(`${API}/backoffice/mundos/${mundo2.id}/misiones`).set(bearer(editora)).send({ rangoEdad: 'R2', titulo: 'El vuelo del cóndor', lecturaIds: [lecturas.mision] }).expect(201);

    const r = (await t.http().get(`${API}/yo/recomendaciones`).set(bearer(mateo.token)).expect(200)).body;
    expect(r.slice(0, 2)).toEqual([
      expect.objectContaining({ tipo: 'ASIGNACION_DOCENTE', prioridad: 1, lectura: expect.objectContaining({ id: lecturas.asignada, titulo: 'La lectura de la profe' }) }),
      expect.objectContaining({ tipo: 'LECTURA_MISION', prioridad: 2, lectura: expect.objectContaining({ id: lecturas.mision }), mision: expect.objectContaining({ titulo: 'El vuelo del cóndor' }) }),
    ]);
    const vigentes = await t.prisma.recomendacion.findMany({ where: { estudianteId: mateo.id, vigente: true }, orderBy: { prioridad: 'asc' } });
    expect(vigentes.map((v) => [v.prioridad, v.tipo])).toEqual(r.map((x: { prioridad: number; tipo: string }) => [x.prioridad, x.tipo]));
    expect(await t.prisma.recomendacion.count({ where: { estudianteId: mateo.id, vigente: false } })).toBeGreaterThanOrEqual(1);

    // Pedirlas de nuevo sin cambios no las reescribe.
    const total = await t.prisma.recomendacion.count({ where: { estudianteId: mateo.id } });
    await t.http().get(`${API}/yo/recomendaciones`).set(bearer(mateo.token)).expect(200);
    expect(await t.prisma.recomendacion.count({ where: { estudianteId: mateo.id } })).toBe(total);
  });

  it('cada niño ve lo de su edad; lo que la docente asignó al aula va aunque sea de otra edad (Lía, 6 años)', async () => {
    const r = (await t.http().get(`${API}/yo/recomendaciones`).set(bearer(lia.token)).expect(200)).body;
    expect(r).toEqual([expect.objectContaining({ tipo: 'ASIGNACION_DOCENTE', lectura: expect.objectContaining({ id: lecturas.asignada }) })]);
  });

  it('solo el propio estudiante: la docente 403 y sin sesión 401', async () => {
    await perfil(tokenDocente).expect(403);
    await t.http().get(`${API}/yo/recomendaciones`).set(bearer(tokenDocente)).expect(403);
    await t.http().get(`${API}/yo/perfil-lector`).expect(401);
  });
});
