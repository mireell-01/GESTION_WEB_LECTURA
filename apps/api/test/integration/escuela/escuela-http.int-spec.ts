import { afterAll, beforeAll, describe, expect, it, onTestFinished } from 'vitest';

import { uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { pinesDelPdf } from '../../support/pdf-texto';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Escuela integrada (RF-014 a RF-020): controllers + guards + validación + casos de uso
 * + Prisma + PostgreSQL real, junto con IAM (perfiles, PIN, vínculos) y Administración (auditoría).
 */
const CONTRASENA = 'Lectura-Segura-2026';
const API = '/api/v1';
const ANIO = new Date().getFullYear();

let t: AppDePrueba;

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
/** Lee el cuerpo binario (PDF) de una respuesta de supertest. */
const binario = (res: NodeJS.ReadableStream, listo: (error: Error | null, cuerpo: Buffer) => void) => {
  const partes: Buffer[] = [];
  res.on('data', (c: Buffer) => partes.push(c));
  res.on('end', () => listo(null, Buffer.concat(partes)));
};
/** Día de Lima (AAAA-MM-DD) desplazado `dias` desde hoy. */
const diaLima = (dias = 0) => new Date(Date.now() - 5 * 3_600_000 + dias * 86_400_000).toISOString().slice(0, 10);

async function cuentaConSesion(email: string, rol: 'FAMILIAR' | 'DOCENTE') {
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Ana Ríos', email, contrasena: CONTRASENA, rol }).expect(201);
  const correos = (await t.http().get(`${API}/dev/correos`).expect(200)).body as { para: string; enlace: string }[];
  const enlace = correos.find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200);
  const { id } = await t.prisma.cuenta.findUniqueOrThrow({ where: { email } });
  return { id, token: login.body.accessToken as string };
}

/** Contenido publicado que el docente puede asignar (lo crearán los módulos Biblioteca y Aventura). */
async function sembrarCatalogo() {
  const autorId = uuidV7();
  const lectura = await t.prisma.lectura.create({ data: { id: uuidV7(), autorId } });
  const version = await t.prisma.versionLectura.create({
    data: {
      id: uuidV7(), lecturaId: lectura.id, numero: 1, estado: 'PUBLICADO', titulo: 'El zorro y la luna', rangoEdad: 'R2',
      nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['LIT', 'INF'], licencia: 'CC BY 4.0',
      texto: 'Había una vez un zorro que miraba la luna.', autorId, revisorId: uuidV7(), publicadaEn: new Date(),
    },
  });
  await t.prisma.lectura.update({ where: { id: lectura.id }, data: { versionPublicadaId: version.id } });
  const borrador = await t.prisma.lectura.create({ data: { id: uuidV7(), autorId } });
  await t.prisma.versionLectura.create({
    data: {
      id: uuidV7(), lecturaId: borrador.id, numero: 1, titulo: 'Borrador sin publicar', rangoEdad: 'R2', nivelDificultad: 1,
      tematica: 'x', tipoTexto: 'CUENTO', texto: 'x', autorId,
    },
  });
  const mundo = await t.prisma.mundo.findUniqueOrThrow({ where: { numero: 1 } });
  const mision = await t.prisma.mision.create({ data: { id: uuidV7(), mundoId: mundo.id, orden: 1, titulo: 'El mapa perdido' } });
  return { lecturaId: lectura.id, borradorId: borrador.id, misionId: mision.id };
}

let docente: { id: string; token: string };
let aulaId: string;
let mateoId: string;
let anaId: string;
let catalogo: Awaited<ReturnType<typeof sembrarCatalogo>>;

describe('Aulas y matrículas (RF-014, RF-015, RF-016, RN-17)', () => {
  it('la docente crea su aula con código único y el consentimiento institucional queda registrado', async () => {
    docente = await cuentaConSesion('docente.escuela@lectoaventura.test', 'DOCENTE');
    const r = await t.http().post(`${API}/aulas`).set(bearer(docente.token)).send({
      nombre: '3.° B', grado: '3', anioLectivo: ANIO, institucion: 'IE 1234 Santa Rosa',
      autoridadConsentimiento: 'Directora Ruiz', declaraConsentimiento: true,
    }).expect(201);
    aulaId = r.body.id;

    expect(r.body).toMatchObject({ nombre: '3.° B', estado: 'ACTIVA', totalEstudiantes: 0 });
    expect(r.body.codigo).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(await t.prisma.consentimiento.findFirstOrThrow({ where: { aulaId } })).toMatchObject({
      tipo: 'INSTITUCIONAL', cuentaResponsableId: docente.id, otorganteNombre: 'Directora Ruiz',
    });
  });

  it('valida los datos del aula y exige declarar el consentimiento', async () => {
    const base = { nombre: '3.° C', grado: '3', anioLectivo: ANIO, institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz' };
    const sinDeclarar = await t.http().post(`${API}/aulas`).set(bearer(docente.token)).send({ ...base, declaraConsentimiento: false }).expect(400);
    expect(sinDeclarar.body.detail).toMatch(/consentimiento de las familias/);
    const grado = await t.http().post(`${API}/aulas`).set(bearer(docente.token)).send({ ...base, grado: '7', declaraConsentimiento: true }).expect(400);
    expect(grado.body.detail).toMatch(/1.° a 6.°/);
  });

  it('matricula uno y por CSV; la respuesta nunca trae el PIN', async () => {
    const uno = await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(docente.token)).send({
      alias: 'Mateo', anioNacimiento: 2017, mesNacimiento: 5, avatar: 'leon',
    }).expect(201);
    mateoId = uno.body.estudianteId;
    expect(uno.body).toEqual({ estudianteId: expect.any(String), alias: 'Mateo', avatar: 'leon' });

    const csv = await t.http().post(`${API}/aulas/${aulaId}/matriculas/importacion`).set(bearer(docente.token)).send({
      csv: 'alias,año,mes,avatar\nAna,2017,3,zorro\nMateo,2017,5,leon\nRita,2017,13,panda',
    }).expect(201);
    anaId = csv.body.matriculados[0].estudianteId;
    expect(csv.body.matriculados.map((m: { alias: string }) => m.alias)).toEqual(['Ana']);
    expect(csv.body.rechazadas.map((f: { fila: number; motivo: string }) => [f.fila, f.motivo])).toEqual([
      [3, 'Ya hay un estudiante con ese alias y avatar en el aula; cambia uno de los dos'],
      [4, expect.stringMatching(/mes/i)],
    ]);
    expect(JSON.stringify(csv.body)).not.toMatch(/"pin"/);

    const perfil = await t.prisma.perfilEstudiante.findUniqueOrThrow({ where: { id: mateoId } });
    expect(perfil).toMatchObject({ cuentaResponsableId: docente.id, alias: 'Mateo' });
    expect(perfil.hashPin).toMatch(/^\$argon2id\$/);
    expect(await t.prisma.matricula.count({ where: { aulaId, estado: 'ACTIVA' } })).toBe(2);
  });

  it('RN-17: otra docente no ve ni gestiona el aula (404); una familia no entra al modo escuela (403)', async () => {
    const otra = await cuentaConSesion('otra.docente@lectoaventura.test', 'DOCENTE');
    await t.http().get(`${API}/aulas/${aulaId}`).set(bearer(otra.token)).expect(404);
    await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(otra.token)).send({ alias: 'Xavi', anioNacimiento: 2017, mesNacimiento: 1, avatar: 'koala' }).expect(404);
    expect((await t.http().get(`${API}/aulas`).set(bearer(otra.token)).expect(200)).body).toEqual([]);
    await t.http().get(`${API}/aulas/no-es-un-id`).set(bearer(otra.token)).expect(404);

    const familia = await cuentaConSesion('familia.curiosa@lectoaventura.test', 'FAMILIAR');
    await t.http().get(`${API}/aulas`).set(bearer(familia.token)).expect(403);

    const detalle = await t.http().get(`${API}/aulas/${aulaId}`).set(bearer(docente.token)).expect(200);
    expect(detalle.body.estudiantes.map((e: { alias: string }) => e.alias)).toEqual(['Ana', 'Mateo']);
    expect(detalle.body.estudiantes[0]).toMatchObject({ bloqueado: false, familiaresVinculados: 0 });
  });
});

describe('Tarjetas de acceso en PDF (RF-017, CR-01)', () => {
  it('el PDF trae un PIN nuevo por estudiante que sirve para entrar desde la tablet del aula', async () => {
    const r = await t.http()
      .post(`${API}/aulas/${aulaId}/tarjetas-acceso.pdf`)
      .set(bearer(docente.token))
      .send({ estudianteIds: [mateoId, anaId] })
      .buffer(true)
      .parse(binario)
      .expect(200);

    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toBe('attachment; filename="tarjetas-3-b.pdf"');
    expect(r.headers['cache-control']).toBe('no-store');
    const [pinAna, pinMateo] = pinesDelPdf(r.body as Buffer);
    expect(pinMateo).toMatch(/^\d{4}$/);

    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(docente.token)).send({ nombre: 'Tablet 1' }).expect(201)).body
      .tokenDispositivo as string;
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: mateoId, pin: pinMateo }).expect(200);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: anaId, pin: pinAna }).expect(200);

    // RF-077: imprimir cambia PIN, así que queda auditado.
    expect(await t.prisma.auditoria.findFirstOrThrow({ where: { accion: 'TARJETAS_ACCESO_GENERADAS', recursoId: aulaId } })).toMatchObject({
      actorId: docente.id, actorRol: 'DOCENTE', datos: expect.objectContaining({ cantidad: 2 }),
    });

    // Reimprimir invalida la tarjeta anterior.
    const otra = await t.http().post(`${API}/aulas/${aulaId}/tarjetas-acceso.pdf`).set(bearer(docente.token)).send({ estudianteIds: [mateoId] }).buffer(true).parse(binario).expect(200);
    const [nuevo] = pinesDelPdf(otra.body as Buffer);
    if (nuevo !== pinMateo) {
      await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: mateoId, pin: pinMateo }).expect(401);
    }
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: mateoId, pin: nuevo }).expect(200);
  });

  it('pide estudiantes del aula', async () => {
    const r = await t.http().post(`${API}/aulas/${aulaId}/tarjetas-acceso.pdf`).set(bearer(docente.token)).send({ estudianteIds: [uuidV7()] }).expect(400);
    expect(r.body.detail).toMatch(/al menos un estudiante/);
    await t.http().post(`${API}/aulas/${aulaId}/tarjetas-acceso.pdf`).set(bearer(docente.token)).send({ estudianteIds: [] }).expect(400);
  });
});

describe('Asignaciones (RF-018)', () => {
  let asignacionId: string;

  it('el catálogo muestra solo lo publicado: lecturas y misiones', async () => {
    catalogo = await sembrarCatalogo();
    const r = await t.http().get(`${API}/aulas/${aulaId}/asignaciones/catalogo`).set(bearer(docente.token)).expect(200);
    expect(r.body).toEqual({
      lecturas: [{ id: catalogo.lecturaId, tipo: 'LECTURA', titulo: 'El zorro y la luna', detalle: '8–9 años · nivel 2' }],
      misiones: [{ id: catalogo.misionId, tipo: 'MISION', titulo: 'El mapa perdido', detalle: 'Mundo 1 · Explorador' }],
    });
  });

  it('asigna a toda el aula con fecha límite; se guarda con su estado y sin destinatarios', async () => {
    const r = await t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).send({
      tipo: 'LECTURA', contenidoId: catalogo.lecturaId, fechaLimite: diaLima(7),
    }).expect(201);
    asignacionId = r.body.id;
    expect(r.body).toMatchObject({ titulo: 'El zorro y la luna', paraTodaElAula: true, estado: 'ACTIVA', fechaInicio: diaLima(), fechaLimite: diaLima(7) });

    const fila = await t.prisma.asignacion.findUniqueOrThrow({ where: { id: asignacionId }, include: { destinatarios: true } });
    expect(fila).toMatchObject({ tipo: 'LECTURA', lecturaId: catalogo.lecturaId, misionId: null, estado: 'ACTIVA', paraTodaElAula: true, destinatarios: [] });
    expect(fila.fechaLimite.toISOString()).toBe(`${diaLima(8)}T04:59:59.999Z`);
  });

  it('asigna una misión solo a Ana; los destinatarios quedan en su tabla', async () => {
    const r = await t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).send({
      tipo: 'MISION', contenidoId: catalogo.misionId, fechaLimite: diaLima(3), estudianteIds: [anaId],
    }).expect(201);
    expect(r.body.estudiantes).toEqual([{ id: anaId, alias: 'Ana', avatar: 'zorro' }]);
    expect(await t.prisma.asignacionDestinatario.findMany({ where: { asignacionId: r.body.id } })).toEqual([{ asignacionId: r.body.id, estudianteId: anaId }]);
  });

  it('rechaza borradores, repetidos, fechas imposibles y estudiantes ajenos', async () => {
    const enviar = (cuerpo: object) => t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).send(cuerpo);
    expect((await enviar({ tipo: 'LECTURA', contenidoId: catalogo.borradorId, fechaLimite: diaLima(5) }).expect(404)).body.detail).toMatch(/no está disponible/);
    expect((await enviar({ tipo: 'LECTURA', contenidoId: catalogo.lecturaId, fechaLimite: diaLima(9) }).expect(409)).body.detail).toMatch(/ya tiene/);
    expect((await enviar({ tipo: 'MISION', contenidoId: catalogo.misionId, fechaLimite: diaLima(-1) }).expect(400)).body.detail).toMatch(/igual o posterior/);
    expect((await enviar({ tipo: 'MISION', contenidoId: catalogo.misionId, fechaLimite: '15/10/2026' }).expect(400)).body.detail).toMatch(/AAAA-MM-DD/);
    await enviar({ tipo: 'MISION', contenidoId: catalogo.misionId, fechaLimite: diaLima(3), estudianteIds: [uuidV7()] }).expect(400);
    await enviar({ tipo: 'VIDEO', contenidoId: catalogo.misionId, fechaLimite: diaLima(3) }).expect(400);
  });

  it('"Misión del docente": cada estudiante ve en su aventura lo que le toca', async () => {
    const tablet = (await t.http().post(`${API}/aulas/${aulaId}/dispositivos`).set(bearer(docente.token)).send({ nombre: 'Tablet 2' }).expect(201)).body
      .tokenDispositivo as string;
    const entrar = async (perfilId: string) => {
      await t.http().post(`${API}/estudiantes/${perfilId}/pin/restablecer`).set(bearer(docente.token)).send({ pinNuevo: '4826' }).expect(200);
      return (await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId, pin: '4826' }).expect(200)).body.accessToken as string;
    };

    const mateo = await entrar(mateoId);
    const ana = await entrar(anaId);
    expect((await t.http().get(`${API}/yo/asignaciones`).set(bearer(mateo)).expect(200)).body).toEqual([
      { id: asignacionId, tipo: 'LECTURA', contenidoId: catalogo.lecturaId, titulo: 'El zorro y la luna', fechaLimite: diaLima(7), aula: '3.° B' },
    ]);
    expect((await t.http().get(`${API}/yo/asignaciones`).set(bearer(ana)).expect(200)).body.map((a: { titulo: string }) => a.titulo)).toEqual([
      'El mapa perdido', 'El zorro y la luna',
    ]);

    // Cerrada por la docente, desaparece de la aventura y figura como CERRADA en su lista.
    await t.http().post(`${API}/aulas/${aulaId}/asignaciones/${asignacionId}/cerrar`).set(bearer(docente.token)).expect(200);
    expect((await t.http().get(`${API}/yo/asignaciones`).set(bearer(mateo)).expect(200)).body).toEqual([]);
    const lista = await t.http().get(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).expect(200);
    expect(lista.body.map((a: { titulo: string; estado: string }) => [a.titulo, a.estado])).toEqual([
      ['El mapa perdido', 'ACTIVA'],
      ['El zorro y la luna', 'CERRADA'],
    ]);

    // Un adulto no consulta "mis asignaciones" de estudiante.
    await t.http().get(`${API}/yo/asignaciones`).set(bearer(docente.token)).expect(403);
  });

  it('el paso del tiempo vence la asignación en la base al consultarla', async () => {
    const fila = await t.prisma.asignacion.findFirstOrThrow({ where: { aulaId, tipo: 'MISION' } });
    await t.prisma.asignacion.update({
      where: { id: fila.id },
      data: { fechaInicio: new Date(Date.now() - 5 * 86_400_000), fechaLimite: new Date(Date.now() - 86_400_000) },
    });
    const lista = await t.http().get(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).expect(200);
    expect(lista.body.find((a: { id: string }) => a.id === fila.id).estado).toBe('VENCIDA');
    expect((await t.prisma.asignacion.findUniqueOrThrow({ where: { id: fila.id } })).estado).toBe('VENCIDA');
  });
});

describe('Invitación familiar (RF-019)', () => {
  let familia: { id: string; token: string };
  let codigo: string;

  it('la docente genera un código de un solo uso; en la base solo queda su huella', async () => {
    const r = await t.http().post(`${API}/estudiantes/${mateoId}/invitaciones-familiar`).set(bearer(docente.token)).expect(201);
    codigo = r.body.codigo;
    expect(codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(r.body).toMatchObject({ estudiante: { id: mateoId, alias: 'Mateo', avatar: 'leon' }, aula: { id: aulaId, nombre: '3.° B' } });
    expect(new Date(r.body.expiraEn).getTime() - Date.now()).toBeGreaterThan(7 * 86_400_000 - 60_000);

    const fila = await t.prisma.invitacionFamiliar.findFirstOrThrow({ where: { estudianteId: mateoId } });
    expect(fila.hashCodigo).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fila.hashCodigo).not.toContain(codigo.replace('-', ''));
    expect(await t.prisma.auditoria.count({ where: { accion: 'INVITACION_FAMILIAR_GENERADA', recursoId: mateoId, actorId: docente.id } })).toBe(1);
  });

  it('RN-17: otra docente no invita a sus familias (404); una familia no genera códigos (403)', async () => {
    const otra = await cuentaConSesion('tercera.docente@lectoaventura.test', 'DOCENTE');
    await t.http().post(`${API}/estudiantes/${mateoId}/invitaciones-familiar`).set(bearer(otra.token)).expect(404);
    familia = await cuentaConSesion('mama.mateo@lectoaventura.test', 'FAMILIAR');
    await t.http().post(`${API}/estudiantes/${mateoId}/invitaciones-familiar`).set(bearer(familia.token)).expect(403);
  });

  it('la familia canjea el código: queda vinculada, auditada con su IP y lo ve en su panel', async () => {
    const r = await t.http().post(`${API}/familia/vincular`).set(bearer(familia.token)).set('X-Forwarded-For', '203.0.113.7')
      .send({ codigo: codigo.toLowerCase() }).expect(201);
    expect(r.body).toEqual({ estudiante: { id: mateoId, alias: 'Mateo', avatar: 'leon' }, aula: '3.° B' });

    expect(await t.prisma.vinculoResponsable.findFirstOrThrow({ where: { perfilId: mateoId } })).toMatchObject({
      cuentaId: familia.id, origen: 'INVITACION_DOCENTE', revocadoEn: null,
    });
    expect(await t.prisma.invitacionFamiliar.findFirstOrThrow({ where: { estudianteId: mateoId } })).toMatchObject({ cuentaFamiliarId: familia.id });
    expect(await t.prisma.auditoria.findFirstOrThrow({ where: { accion: 'FAMILIAR_VINCULADO' } })).toMatchObject({
      actorId: familia.id, actorRol: 'FAMILIAR', recursoTipo: 'perfil_estudiante', recursoId: mateoId, ip: '203.0.113.7',
    });

    const panel = await t.http().get(`${API}/familia/estudiantes`).set(bearer(familia.token)).expect(200);
    expect(panel.body).toEqual([expect.objectContaining({ id: mateoId, alias: 'Mateo', relacion: 'VINCULADO' })]);
    // Solo lo acompaña: no edita su perfil de aula.
    await t.http().patch(`${API}/familia/estudiantes/${mateoId}`).set(bearer(familia.token)).send({ alias: 'Mati' }).expect(404);

    const detalle = await t.http().get(`${API}/aulas/${aulaId}`).set(bearer(docente.token)).expect(200);
    expect(detalle.body.estudiantes.find((e: { id: string }) => e.id === mateoId).familiaresVinculados).toBe(1);
  });

  it('el mismo código no sirve dos veces ni para otra familia; uno inventado responde igual', async () => {
    const papa = await cuentaConSesion('papa.mateo@lectoaventura.test', 'FAMILIAR');
    const reuso = await t.http().post(`${API}/familia/vincular`).set(bearer(papa.token)).set('X-Forwarded-For', '203.0.113.8').send({ codigo }).expect(400);
    const inventado = await t.http().post(`${API}/familia/vincular`).set(bearer(papa.token)).set('X-Forwarded-For', '203.0.113.8').send({ codigo: 'ZZZZ-ZZZZ' }).expect(400);
    expect(reuso.body.detail).toBe(inventado.body.detail);
    expect(reuso.body.detail).toMatch(/no es válido o ya venció/);
  });

  it('desde la tablet de casa, el niño vinculado entra con el PIN de su tarjeta', async () => {
    const casa = (await t.http().post(`${API}/familia/dispositivos`).set(bearer(familia.token)).send({ nombre: 'Tablet de casa' }).expect(201)).body
      .tokenDispositivo as string;
    const contexto = await t.http().get(`${API}/acceso-estudiante/contexto-dispositivo`).set('x-dispositivo', casa).expect(200);
    expect(contexto.body.estudiantes).toEqual([{ id: mateoId, alias: 'Mateo', avatar: 'leon' }]);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: casa, perfilId: mateoId, pin: '4826' }).expect(200);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: casa, perfilId: anaId, pin: '4826' }).expect(403);
  });

  it('limita los intentos de canje por IP (10 por minuto)', async () => {
    // Las demás pruebas amplían el límite (todas salen de 127.0.0.1); aquí se usa el real.
    process.env['LIMITE_TASA_FACTOR'] = '1';
    onTestFinished(() => {
      process.env['LIMITE_TASA_FACTOR'] = '100';
    });
    const intento = () =>
      t.http().post(`${API}/familia/vincular`).set(bearer(familia.token)).set('X-Forwarded-For', '203.0.113.99').send({ codigo: 'AAAA-AAAA' });
    for (let i = 0; i < 10; i++) expect((await intento()).status).toBe(400);
    const bloqueado = await intento();
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.headers['retry-after']).toBeDefined();
  });
});

describe('Retirar y archivar (RF-020)', () => {
  it('archivar: solo lectura, conserva perfiles, cierra asignaciones y anula invitaciones pendientes', async () => {
    const { codigo } = (await t.http().post(`${API}/estudiantes/${anaId}/invitaciones-familiar`).set(bearer(docente.token)).expect(201)).body;
    await t.http().post(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).send({
      tipo: 'MISION', contenidoId: catalogo.misionId, fechaLimite: diaLima(4),
    }).expect(201);

    const r = await t.http().post(`${API}/aulas/${aulaId}/archivar`).set(bearer(docente.token)).expect(200);
    expect(r.body).toMatchObject({ estado: 'ARCHIVADA', totalEstudiantes: 2 });
    expect(await t.prisma.asignacion.count({ where: { aulaId, estado: { in: ['PROGRAMADA', 'ACTIVA'] } } })).toBe(0);
    expect(await t.prisma.perfilEstudiante.count({ where: { id: { in: [mateoId, anaId] }, eliminadoEn: null } })).toBe(2);

    const tia = await cuentaConSesion('tia.ana@lectoaventura.test', 'FAMILIAR');
    await t.http().post(`${API}/familia/vincular`).set(bearer(tia.token)).set('X-Forwarded-For', '203.0.113.20').send({ codigo }).expect(400);

    // Solo lectura: se consulta, pero no se matricula, asigna ni retira.
    await t.http().get(`${API}/aulas/${aulaId}`).set(bearer(docente.token)).expect(200);
    await t.http().get(`${API}/aulas/${aulaId}/asignaciones`).set(bearer(docente.token)).expect(200);
    await t.http().post(`${API}/aulas/${aulaId}/matriculas`).set(bearer(docente.token)).send({ alias: 'Leo', anioNacimiento: 2017, mesNacimiento: 1, avatar: 'koala' }).expect(409);
    await t.http().delete(`${API}/aulas/${aulaId}/matriculas/${anaId}`).set(bearer(docente.token)).expect(409);
    await t.http().post(`${API}/estudiantes/${anaId}/invitaciones-familiar`).set(bearer(docente.token)).expect(409);
    await t.http().post(`${API}/aulas/${aulaId}/archivar`).set(bearer(docente.token)).expect(409);
  });

  it('retirar a un estudiante de un aula activa lo saca de la lista y de la tablet del aula', async () => {
    const aula = (await t.http().post(`${API}/aulas`).set(bearer(docente.token)).send({
      nombre: '4.° A', grado: '4', anioLectivo: ANIO, institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Ruiz', declaraConsentimiento: true,
    }).expect(201)).body;
    const leo = (await t.http().post(`${API}/aulas/${aula.id}/matriculas`).set(bearer(docente.token)).send({ alias: 'Leo', anioNacimiento: 2016, mesNacimiento: 2, avatar: 'koala' }).expect(201)).body;
    const tablet = (await t.http().post(`${API}/aulas/${aula.id}/dispositivos`).set(bearer(docente.token)).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;

    await t.http().delete(`${API}/aulas/${aula.id}/matriculas/${leo.estudianteId}`).set(bearer(docente.token)).expect(200);
    expect((await t.http().get(`${API}/aulas/${aula.id}`).set(bearer(docente.token)).expect(200)).body.estudiantes).toEqual([]);
    expect((await t.http().get(`${API}/acceso-estudiante/contexto-dispositivo`).set('x-dispositivo', tablet).expect(200)).body.estudiantes).toEqual([]);
    await t.http().delete(`${API}/aulas/${aula.id}/matriculas/${leo.estudianteId}`).set(bearer(docente.token)).expect(404);
  });
});
