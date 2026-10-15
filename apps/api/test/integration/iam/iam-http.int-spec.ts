import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppDePrueba, cookieRefresh, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — IAM integrado: controller + guards + validación + casos de uso + Prisma + PostgreSQL.
 * Verifica también lo que queda guardado en la base (hashes, huellas, outbox).
 */
const CONTRASENA = 'Lectura-Segura-2026';

let t: AppDePrueba;

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

/** Registra, verifica por la bandeja de desarrollo e inicia sesión. */
async function cuentaConSesion(email: string, rol: 'FAMILIAR' | 'DOCENTE' = 'FAMILIAR') {
  await t.http().post('/api/iam/cuentas').send({ nombre: 'Ana Ríos', email, contrasena: CONTRASENA, rol }).expect(201);
  const correos = (await t.http().get('/api/iam/dev/correos').expect(200)).body as { para: string; enlace: string }[];
  const enlace = correos.find((c) => c.para === email)?.enlace as string;
  await t.http().post('/api/iam/correo/verificar').send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  const login = await t.http().post('/api/iam/sesiones').send({ email, contrasena: CONTRASENA }).expect(200);
  return { token: login.body.accessToken as string, cookie: cookieRefresh(login) as string, enlace };
}

describe('Registro, verificación y almacenamiento seguro (RF-001, RF-002)', () => {
  it('la contraseña se guarda con argon2id y el enlace solo como huella SHA-256', async () => {
    const { enlace } = await cuentaConSesion('rosa@lectoaventura.test');
    const cuenta = await t.prisma.cuenta.findUniqueOrThrow({ where: { email: 'rosa@lectoaventura.test' } });
    expect(cuenta.estado).toBe('ACTIVA');
    expect(cuenta.hashContrasena).toMatch(/^\$argon2id\$/);
    expect(cuenta.hashContrasena).not.toContain(CONTRASENA);

    const codigo = new URL(enlace).searchParams.get('codigo') as string;
    const verificacion = await t.prisma.verificacion.findFirstOrThrow({ where: { cuentaId: cuenta.id } });
    expect(verificacion.codigo).toMatch(/^[0-9a-f]{64}$/);
    expect(verificacion.codigo).not.toBe(codigo);
    expect(verificacion.canjeado).toBe(true);
  });

  it('la validación HTTP devuelve 400 con mensajes en español y rechaza campos extra', async () => {
    const corta = await t.http().post('/api/iam/cuentas').send({ nombre: 'Ana', email: 'x@lectoaventura.test', contrasena: 'corta', rol: 'FAMILIAR' });
    expect(corta.status).toBe(400);
    expect(corta.body.mensaje).toMatch(/al menos 10 caracteres/);

    const rol = await t.http().post('/api/iam/cuentas').send({ nombre: 'Ana', email: 'x@lectoaventura.test', contrasena: CONTRASENA, rol: 'ADMIN_PLATAFORMA' });
    expect(rol.status).toBe(400);

    const extra = await t.http().post('/api/iam/cuentas').send({ nombre: 'Ana', email: 'x@lectoaventura.test', contrasena: CONTRASENA, rol: 'FAMILIAR', estado: 'ACTIVA' });
    expect(extra.status).toBe(400);
    expect(extra.body.mensaje).toMatch(/estado should not exist/);
  });

  it('cada acción sensible queda en el outbox y se marca como publicada', async () => {
    const eventos = await t.prisma.outboxEvento.findMany({ where: { tipo: { startsWith: 'iam.' } } });
    expect(eventos.map((e) => e.tipo)).toEqual(expect.arrayContaining(['iam.CuentaCreada', 'iam.CuentaVerificada']));
    expect(eventos.every((e) => e.publicadoEn !== null)).toBe(true);
  });
});

describe('Sesión con refresh token rotativo en cookie httpOnly (RF-003, RF-010)', () => {
  it('la cookie es httpOnly, SameSite=Lax y limitada a /api/iam/sesiones', async () => {
    const { cookie } = await cuentaConSesion('cookie@lectoaventura.test');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/iam\/sesiones/);
  });

  it('renovar rota la huella guardada; el refresh anterior responde 401 y borra la cookie', async () => {
    const { cookie } = await cuentaConSesion('rota@lectoaventura.test');
    const valor = cookie.split(';')[0] as string;
    const antes = await t.prisma.sesion.findFirstOrThrow({ orderBy: { creadaEn: 'desc' } });

    const renovada = await t.http().post('/api/iam/sesiones/renovar').set('Cookie', valor).expect(200);
    const despues = await t.prisma.sesion.findUniqueOrThrow({ where: { id: antes.id } });
    expect(despues.hashRefreshToken).not.toBe(antes.hashRefreshToken);
    expect(cookieRefresh(renovada)).toBeDefined();

    const reutilizada = await t.http().post('/api/iam/sesiones/renovar').set('Cookie', valor).expect(401);
    expect(cookieRefresh(reutilizada)).toMatch(/la_refresh=;/);
  });

  it('cerrar sesión revoca el token: la siguiente petición devuelve 401', async () => {
    const { token } = await cuentaConSesion('cierra@lectoaventura.test');
    await t.http().get('/api/iam/yo').set('Authorization', `Bearer ${token}`).expect(200);
    await t.http().post('/api/iam/sesiones/cerrar').set('Authorization', `Bearer ${token}`).expect(200);
    const r = await t.http().get('/api/iam/yo').set('Authorization', `Bearer ${token}`).expect(401);
    expect(r.body.mensaje).toMatch(/sesión se cerró/);
  });

  it('sin token o con token manipulado responde 401', async () => {
    await t.http().get('/api/iam/yo').expect(401);
    await t.http().get('/api/iam/yo').set('Authorization', 'Bearer eyJhbGciOiJub25lIn0.e30.').expect(401);
  });
});

describe('Familia: consentimiento, perfiles, dispositivo e ingreso del estudiante (RF-005 a RF-009)', () => {
  let familia: { token: string };
  let perfilId: string;
  let tokenDispositivo: string;
  const auth = () => ({ Authorization: `Bearer ${familia.token}` });

  beforeAll(async () => {
    familia = await cuentaConSesion('familia@lectoaventura.test');
  });

  it('sin consentimiento → 409; con consentimiento crea el perfil con PIN argon2', async () => {
    const perfil = { alias: 'Mateo', anioNacimiento: 2018, mesNacimiento: 5, avatar: 'leon', pin: '2580' };
    await t.http().post('/api/iam/perfiles-estudiante').set(auth()).send(perfil).expect(409);
    await t.http().post('/api/iam/consentimientos').set(auth()).send({ otorganteNombre: 'Ana Ríos', aceptaPolitica: true }).expect(201);

    const creado = await t.http().post('/api/iam/perfiles-estudiante').set(auth()).send(perfil).expect(201);
    perfilId = creado.body.id;
    expect(creado.body).not.toHaveProperty('hashPin');

    const fila = await t.prisma.perfilEstudiante.findUniqueOrThrow({ where: { id: perfilId } });
    expect(fila.hashPin).toMatch(/^\$argon2id\$/);
    const consentimiento = await t.prisma.consentimiento.findUniqueOrThrow({ where: { id: fila.consentimientoId } });
    expect(consentimiento).toMatchObject({ tipo: 'PARENTAL', versionPolitica: '2026-09', vigente: true });
  });

  it('el consentimiento exige aceptar la política explícitamente', async () => {
    const r = await t.http().post('/api/iam/consentimientos').set(auth()).send({ otorganteNombre: 'Ana Ríos', aceptaPolitica: false });
    expect(r.status).toBe(400);
    expect(r.body.mensaje).toMatch(/aceptar la política/);
  });

  it('el dispositivo vinculado muestra solo alias y avatar; sin él, 403', async () => {
    await t.http().get('/api/iam/dispositivo/perfiles').expect(403);
    tokenDispositivo = (await t.http().post('/api/iam/dispositivos').set(auth()).send({ nombre: 'Tablet' }).expect(201)).body.tokenDispositivo;
    const r = await t.http().get('/api/iam/dispositivo/perfiles').set('x-dispositivo', tokenDispositivo).expect(200);
    expect(r.body).toEqual([{ id: perfilId, alias: 'Mateo', avatar: 'leon' }]);
  });

  it('5 PIN incorrectos → 423 con hora de desbloqueo, guardado en la base y en el outbox', async () => {
    const intento = (pin: string) => t.http().post('/api/iam/sesiones/estudiante').send({ tokenDispositivo, perfilId, pin });
    const primero = await intento('9090');
    expect(primero.status).toBe(401);
    expect(primero.body.detalle).toEqual({ intentosRestantes: 4 });
    for (let i = 0; i < 3; i++) await intento('9090').expect(401);
    const bloqueo = await intento('9090').expect(423);
    expect(Date.parse(bloqueo.body.detalle.desbloqueaEn)).toBeGreaterThan(Date.now() + 14 * 60_000);

    const fila = await t.prisma.perfilEstudiante.findUniqueOrThrow({ where: { id: perfilId } });
    expect(fila.bloqueadoHasta).not.toBeNull();
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'iam.EstudianteBloqueado', agregadoId: perfilId } })).toBe(1);
  });

  it('el adulto restablece el PIN y el estudiante entra con rol ESTUDIANTE (cookie de sesión)', async () => {
    await t.http().post(`/api/iam/perfiles-estudiante/${perfilId}/pin`).set(auth()).send({ pinNuevo: '3691' }).expect(200);
    const r = await t.http().post('/api/iam/sesiones/estudiante').send({ tokenDispositivo, perfilId, pin: '3691' }).expect(200);
    expect(r.body).toMatchObject({ rol: 'ESTUDIANTE', rutaInicial: '/estudiante' });
    expect(cookieRefresh(r)).not.toMatch(/Max-Age|Expires/i);

    // RF-009: el estudiante no entra a rutas de la familia ni del docente.
    const tokenEst = r.body.accessToken;
    await t.http().get('/api/iam/perfiles-estudiante').set('Authorization', `Bearer ${tokenEst}`).expect(403);
    await t.http().get('/api/escuela/aulas').set('Authorization', `Bearer ${tokenEst}`).expect(403);
  });

  it('RF-009: un familiar no accede al modo escuela', async () => {
    await t.http().get('/api/escuela/aulas').set(auth()).expect(403);
  });

  it('RF-012: exporta JSON descargable con datos de IAM y de otros módulos', async () => {
    const r = await t.http().get(`/api/iam/perfiles-estudiante/${perfilId}/exportacion`).set(auth()).expect(200);
    expect(r.headers['content-disposition']).toMatch(/attachment; filename="lectoaventura-datos-/);
    expect(r.body).toMatchObject({ perfil: { alias: 'Mateo', rangoEdad: 'R2' }, consentimiento: { tipo: 'PARENTAL' }, aulas: [] });
    expect(JSON.stringify(r.body)).not.toMatch(/argon2|hashPin/);
  });

  it('RN-17: otra familia no ve ni gestiona este perfil (404)', async () => {
    const otra = await cuentaConSesion('otra.familia@lectoaventura.test');
    await t.http().get(`/api/iam/perfiles-estudiante/${perfilId}/exportacion`).set('Authorization', `Bearer ${otra.token}`).expect(404);
    await t.http().delete(`/api/iam/perfiles-estudiante/${perfilId}`).set('Authorization', `Bearer ${otra.token}`).expect(404);
  });

  it('RF-013: eliminar borra los datos personales y cierra sus sesiones', async () => {
    await t.http().delete(`/api/iam/perfiles-estudiante/${perfilId}`).set(auth()).expect(200);
    const fila = await t.prisma.perfilEstudiante.findUniqueOrThrow({ where: { id: perfilId } });
    expect(fila).toMatchObject({ alias: 'Perfil eliminado', hashPin: '', activo: false });
    expect(await t.prisma.sesion.count({ where: { sujetoId: perfilId, revocadaEn: null } })).toBe(0);
    const lista = await t.http().get('/api/iam/perfiles-estudiante').set(auth()).expect(200);
    expect(lista.body).toEqual([]);
  });
});

describe('Recuperación de contraseña (RF-004)', () => {
  it('misma respuesta 202 exista o no la cuenta; el enlace cambia la contraseña y revoca sesiones', async () => {
    const { token } = await cuentaConSesion('recupera@lectoaventura.test');
    const a = await t.http().post('/api/iam/contrasena/recuperar').send({ email: 'recupera@lectoaventura.test' }).expect(202);
    const b = await t.http().post('/api/iam/contrasena/recuperar').send({ email: 'nadie@lectoaventura.test' }).expect(202);
    expect(a.body).toEqual(b.body);

    const correos = (await t.http().get('/api/iam/dev/correos')).body as { para: string; asunto: string; enlace: string }[];
    const enlace = correos.find((c) => c.para === 'recupera@lectoaventura.test' && /Recupera/.test(c.asunto))?.enlace as string;
    await t.http()
      .post('/api/iam/contrasena/restablecer')
      .send({ codigo: new URL(enlace).searchParams.get('codigo'), contrasenaNueva: 'Nueva-Clave-Lectora-1' })
      .expect(200);

    await t.http().get('/api/iam/yo').set('Authorization', `Bearer ${token}`).expect(401);
    await t.http().post('/api/iam/sesiones').send({ email: 'recupera@lectoaventura.test', contrasena: 'Nueva-Clave-Lectora-1' }).expect(200);
  });
});
