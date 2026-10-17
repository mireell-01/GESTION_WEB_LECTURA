import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppDePrueba, cookieRefresh, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — IAM integrado: controllers + guards + validación + casos de uso + Prisma + PostgreSQL,
 * con las rutas del contrato del SRS (§7, `/api/v1`). Verifica también lo guardado en la base.
 */
const CONTRASENA = 'Lectura-Segura-2026';
const API = '/api/v1';

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
  await t.http().post(`${API}/auth/registro`).send({ nombre: 'Ana Ríos', email, contrasena: CONTRASENA, rol }).expect(201);
  const correos = (await t.http().get(`${API}/dev/correos`).expect(200)).body as { para: string; enlace: string }[];
  const enlace = correos.find((c) => c.para === email)?.enlace as string;
  await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: new URL(enlace).searchParams.get('codigo') }).expect(200);
  const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200);
  const { id } = await t.prisma.cuenta.findUniqueOrThrow({ where: { email } });
  return { id, token: login.body.accessToken as string, cookie: cookieRefresh(login) as string, enlace };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Contrato del API (SRS §7)', () => {
  it('las rutas viven bajo /api/v1 y toda respuesta trae X-Request-Id', async () => {
    const r = await t.http().get(`${API}/auth/yo`).expect(401);
    expect(r.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const propio = await t.http().get(`${API}/auth/yo`).set('X-Request-Id', 'traza-del-cliente-001').expect(401);
    expect(propio.headers['x-request-id']).toBe('traza-del-cliente-001');
    await t.http().get('/api/iam/yo').expect(404);
  });

  it('los errores son Problem Details (RFC 9457) con requestId', async () => {
    const r = await t.http().post(`${API}/auth/login`).send({ email: 'nadie@lectoaventura.test', contrasena: 'x' }).expect(401);
    expect(r.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(r.body).toMatchObject({
      type: 'https://lectoaventura.pe/problemas/no-autenticado',
      status: 401,
      detail: 'Correo o contraseña incorrectos',
      instance: `${API}/auth/login`,
    });
    expect(r.body.requestId).toBe(r.headers['x-request-id']);
  });
});

describe('Registro, verificación y almacenamiento seguro (RF-001, RF-002)', () => {
  it('la contraseña se guarda con argon2id y el enlace solo como huella SHA-256', async () => {
    const { enlace } = await cuentaConSesion('rosa@lectoaventura.test');
    const cuenta = await t.prisma.cuenta.findUniqueOrThrow({ where: { email: 'rosa@lectoaventura.test' } });
    expect(cuenta.estado).toBe('ACTIVA');
    expect(cuenta.hashContrasena).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);

    const codigo = new URL(enlace).searchParams.get('codigo') as string;
    const verificacion = await t.prisma.verificacion.findFirstOrThrow({ where: { cuentaId: cuenta.id } });
    expect(verificacion.codigo).toMatch(/^[0-9a-f]{64}$/);
    expect(verificacion.codigo).not.toBe(codigo);
    expect(verificacion.canjeado).toBe(true);
  });

  it('la validación HTTP devuelve 400 con mensajes en español y rechaza campos extra', async () => {
    const corta = await t.http().post(`${API}/auth/registro`).send({ nombre: 'Ana', email: 'x@lectoaventura.test', contrasena: 'corta', rol: 'FAMILIAR' });
    expect(corta.status).toBe(400);
    expect(corta.body.detail).toMatch(/al menos 10 caracteres/);

    await t.http().post(`${API}/auth/registro`).send({ nombre: 'Ana', email: 'x@lectoaventura.test', contrasena: CONTRASENA, rol: 'ADMIN_PLATAFORMA' }).expect(400);
    const extra = await t.http().post(`${API}/auth/registro`).send({ nombre: 'Ana', email: 'x@lectoaventura.test', contrasena: CONTRASENA, rol: 'FAMILIAR', estado: 'ACTIVA' });
    expect(extra.status).toBe(400);
    expect(extra.body.detail).toMatch(/estado should not exist/);
  });

  it('cada acción sensible queda en el outbox y se marca como publicada', async () => {
    const eventos = await t.prisma.outboxEvento.findMany({ where: { tipo: { startsWith: 'iam.' } } });
    expect(eventos.map((e) => e.tipo)).toEqual(expect.arrayContaining(['iam.CuentaCreada', 'iam.CuentaVerificada']));
    expect(eventos.every((e) => e.publicadoEn !== null)).toBe(true);
  });
});

describe('Sesión con refresh token rotativo (RF-003, RF-010, ADR-005)', () => {
  it('la cookie es httpOnly, SameSite=Strict y limitada a /api/v1/auth', async () => {
    const { cookie } = await cuentaConSesion('cookie@lectoaventura.test');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('renovar rota la huella guardada y registra la anterior como usada', async () => {
    const { cookie } = await cuentaConSesion('rota@lectoaventura.test');
    const valor = cookie.split(';')[0] as string;
    const antes = await t.prisma.sesion.findFirstOrThrow({ orderBy: { creadaEn: 'desc' } });

    const renovada = await t.http().post(`${API}/auth/refresh`).set('Cookie', valor).expect(200);
    const despues = await t.prisma.sesion.findUniqueOrThrow({ where: { id: antes.id } });
    expect(despues.hashRefreshToken).not.toBe(antes.hashRefreshToken);
    expect(await t.prisma.refreshTokenUsado.findUnique({ where: { hash: antes.hashRefreshToken } })).toMatchObject({ sesionId: antes.id });
    expect(cookieRefresh(renovada)).toBeDefined();
  });

  it('ADR-005: reutilizar un refresh anterior revoca toda la sesión (401, cookie borrada, evento)', async () => {
    const { cookie, token } = await cuentaConSesion('robo@lectoaventura.test');
    const viejo = cookie.split(';')[0] as string;
    const renovada = await t.http().post(`${API}/auth/refresh`).set('Cookie', viejo).expect(200);
    const nuevo = (cookieRefresh(renovada) as string).split(';')[0] as string;

    const reutilizado = await t.http().post(`${API}/auth/refresh`).set('Cookie', viejo).expect(401);
    expect(cookieRefresh(reutilizado)).toMatch(/la_refresh=;/);
    await t.http().post(`${API}/auth/refresh`).set('Cookie', nuevo).expect(401);
    await t.http().get(`${API}/auth/yo`).set(bearer(token)).expect(401);
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'iam.ReutilizacionRefreshDetectada' } })).toBe(1);
  });

  it('cerrar sesión revoca el token: la siguiente petición devuelve 401', async () => {
    const { token } = await cuentaConSesion('cierra@lectoaventura.test');
    await t.http().get(`${API}/auth/yo`).set(bearer(token)).expect(200);
    await t.http().post(`${API}/auth/logout`).set(bearer(token)).expect(200);
    const r = await t.http().get(`${API}/auth/yo`).set(bearer(token)).expect(401);
    expect(r.body.detail).toMatch(/sesión se cerró/);
  });

  it('sin token o con token manipulado responde 401', async () => {
    await t.http().get(`${API}/auth/yo`).expect(401);
    await t.http().get(`${API}/auth/yo`).set('Authorization', 'Bearer eyJhbGciOiJub25lIn0.e30.').expect(401);
  });
});

describe('Familia: consentimiento, perfiles, dispositivo e ingreso (RF-005 a RF-009, RF-071)', () => {
  let familia: { id: string; token: string };
  let perfilId: string;
  let tokenDispositivo: string;
  const auth = () => bearer(familia.token);

  beforeAll(async () => {
    familia = await cuentaConSesion('familia@lectoaventura.test');
  });

  it('sin consentimiento → 409; con consentimiento crea el perfil con PIN argon2', async () => {
    const perfil = { alias: 'Mateo', anioNacimiento: 2018, mesNacimiento: 5, avatar: 'leon', pin: '2580' };
    await t.http().post(`${API}/estudiantes`).set(auth()).send(perfil).expect(409);
    await t.http().post(`${API}/consentimientos`).set(auth()).send({ otorganteNombre: 'Ana Ríos', aceptaPolitica: true }).expect(201);

    const creado = await t.http().post(`${API}/estudiantes`).set(auth()).send(perfil).expect(201);
    perfilId = creado.body.id;
    expect(creado.body).not.toHaveProperty('hashPin');

    const fila = await t.prisma.perfilEstudiante.findUniqueOrThrow({ where: { id: perfilId } });
    expect(fila.hashPin).toMatch(/^\$argon2id\$/);
    const consentimiento = await t.prisma.consentimiento.findUniqueOrThrow({ where: { id: fila.consentimientoId } });
    expect(consentimiento).toMatchObject({ tipo: 'PARENTAL', versionPolitica: '2026-09', vigente: true });
  });

  it('RF-071: listar y editar perfiles de la familia', async () => {
    const lista = await t.http().get(`${API}/familia/estudiantes`).set(auth()).expect(200);
    expect(lista.body.map((p: { alias: string }) => p.alias)).toEqual(['Mateo']);
    const editado = await t.http().patch(`${API}/familia/estudiantes/${perfilId}`).set(auth()).send({ avatar: 'tigre' }).expect(200);
    expect(editado.body.avatar).toBe('tigre');
  });

  it('el dispositivo vinculado muestra solo alias y avatar; sin él, 403', async () => {
    await t.http().get(`${API}/acceso-estudiante/contexto-dispositivo`).expect(403);
    const vinculo = await t.http().post(`${API}/familia/dispositivos`).set(auth()).send({ nombre: 'Tablet' }).expect(201);
    tokenDispositivo = vinculo.body.tokenDispositivo;
    expect(vinculo.body.contexto).toEqual({ tipo: 'FAMILIA', nombre: 'Tu familia' });
    const fila = await t.prisma.dispositivoIngreso.findFirstOrThrow({ where: { cuentaId: familia.id } });
    expect(fila.aulaId).toBeNull();
    expect(fila.hashToken).not.toBe(tokenDispositivo);

    const r = await t.http().get(`${API}/acceso-estudiante/contexto-dispositivo`).set('x-dispositivo', tokenDispositivo).expect(200);
    expect(r.body).toEqual({ contexto: { tipo: 'FAMILIA', nombre: 'Tu familia' }, estudiantes: [{ id: perfilId, alias: 'Mateo', avatar: 'tigre' }] });
  });

  it('CR-01: el login exige la tablet activada y ya no acepta código de aula', async () => {
    await t.http().post(`${API}/acceso-estudiante/login`).send({ perfilId, pin: '2580' }).expect(400);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ perfilId, pin: '2580', tokenDispositivo, codigoAula: 'ABC234' }).expect(400);
    await t.http().get(`${API}/acceso-estudiante/contexto/ABC234`).expect(404);
  });

  it('5 PIN incorrectos → 423 con hora de desbloqueo, guardado en la base y en el outbox', async () => {
    const intento = (pin: string) => t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo, perfilId, pin });
    const primero = await intento('9090');
    expect(primero.status).toBe(401);
    expect(primero.body.intentosRestantes).toBe(4);
    for (let i = 0; i < 3; i++) await intento('9090').expect(401);
    const bloqueo = await intento('9090').expect(423);
    expect(Date.parse(bloqueo.body.desbloqueaEn)).toBeGreaterThan(Date.now() + 14 * 60_000);

    const fila = await t.prisma.perfilEstudiante.findUniqueOrThrow({ where: { id: perfilId } });
    expect(fila.bloqueadoHasta).not.toBeNull();
    expect(await t.prisma.outboxEvento.count({ where: { tipo: 'iam.EstudianteBloqueado', agregadoId: perfilId } })).toBe(1);
  });

  it('el adulto restablece el PIN y el estudiante entra con rol ESTUDIANTE (cookie de sesión)', async () => {
    await t.http().post(`${API}/estudiantes/${perfilId}/pin/restablecer`).set(auth()).send({ pinNuevo: '3691' }).expect(200);
    const r = await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo, perfilId, pin: '3691' }).expect(200);
    expect(r.body).toMatchObject({ rol: 'ESTUDIANTE', rutaInicial: '/estudiante' });
    expect(cookieRefresh(r)).not.toMatch(/Max-Age|Expires/i);

    // RF-009: el estudiante no entra a rutas de la familia ni del docente.
    await t.http().get(`${API}/familia/estudiantes`).set(bearer(r.body.accessToken)).expect(403);
    await t.http().get(`${API}/aulas`).set(bearer(r.body.accessToken)).expect(403);
  });

  it('RF-009: un familiar no accede al modo escuela', async () => {
    await t.http().get(`${API}/aulas`).set(auth()).expect(403);
  });

  it('RF-012: exporta JSON y PDF por enlaces firmados de 72 h; un enlace alterado se rechaza', async () => {
    const r = await t.http().post(`${API}/estudiantes/${perfilId}/exportaciones`).set(auth()).expect(201);
    expect(Date.parse(r.body.expiraEn) - Date.now()).toBeGreaterThan(71.9 * 3_600_000);

    // Los enlaces no necesitan sesión: la firma es la credencial.
    const json = await t.http().get(r.body.enlaces.json).expect(200);
    expect(json.headers['content-disposition']).toMatch(/attachment; filename="lectoaventura-datos-\d{4}-\d{2}-\d{2}\.json"/);
    expect(json.headers['cache-control']).toBe('no-store');
    const datos = json.body as Record<string, unknown>;
    expect(datos).toMatchObject({ perfil: { alias: 'Mateo', rangoEdad: 'R2' }, consentimiento: { tipo: 'PARENTAL' }, aulas: [] });
    expect(JSON.stringify(datos)).not.toMatch(/argon2|hashPin/);

    const pdf = await t.http().get(r.body.enlaces.pdf).buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (d: Buffer) => partes.push(d));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    }).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    const alterado = (r.body.enlaces.pdf as string).replace(/firma=[^&]+/, 'firma=otra');
    await t.http().get(alterado).expect(403);
    const otroFormato = (r.body.enlaces.json as string).replace('/json?', '/pdf?');
    await t.http().get(otroFormato).expect(403);
  });

  it('RN-17: otra familia no ve ni gestiona este perfil (404)', async () => {
    const otra = await cuentaConSesion('otra.familia@lectoaventura.test');
    await t.http().post(`${API}/estudiantes/${perfilId}/exportaciones`).set(bearer(otra.token)).expect(404);
    await t.http().post(`${API}/estudiantes/${perfilId}/solicitudes-eliminacion`).set(bearer(otra.token)).expect(404);
  });

  it('RF-013: eliminar borra los datos personales, cierra sus sesiones y lo saca del dispositivo', async () => {
    await t.http().post(`${API}/estudiantes/${perfilId}/solicitudes-eliminacion`).set(auth()).expect(201);
    const fila = await t.prisma.perfilEstudiante.findUniqueOrThrow({ where: { id: perfilId } });
    expect(fila).toMatchObject({ alias: 'Perfil eliminado', hashPin: '', activo: false });
    expect(await t.prisma.sesion.count({ where: { sujetoId: perfilId, revocadaEn: null } })).toBe(0);
    expect((await t.http().get(`${API}/familia/estudiantes`).set(auth()).expect(200)).body).toEqual([]);
    const contexto = await t.http().get(`${API}/acceso-estudiante/contexto-dispositivo`).set('x-dispositivo', tokenDispositivo);
    expect(contexto.body.estudiantes).toEqual([]);
  });
});

describe('Tablet del aula activada por la docente, integrada con Escuela (RF-007, RN-04, RF-015, RF-020, CR-01)', () => {
  it('la docente activa la tablet; el niño ve solo su aula y entra sin escribir ningún código', async () => {
    const docente = await cuentaConSesion('docente@lectoaventura.test', 'DOCENTE');
    const aula = await t.http().post(`${API}/aulas`).set(bearer(docente.token)).send({
      nombre: '3.° A', grado: '3', anioLectivo: new Date().getFullYear(), institucion: 'IE Paucar del Sara Sara',
      autoridadConsentimiento: 'Directora Ruiz', declaraConsentimiento: true,
    }).expect(201);
    const tarjeta = await t.http().post(`${API}/aulas/${aula.body.id}/matriculas`).set(bearer(docente.token)).send({
      alias: 'Sofía', anioNacimiento: 2017, mesNacimiento: 3, avatar: 'buho',
    }).expect(201);
    // RF-017: la matrícula no devuelve el PIN; la docente puede fijarlo como responsable (RN-03).
    expect(tarjeta.body).not.toHaveProperty('pin');
    await t.http().post(`${API}/estudiantes/${tarjeta.body.estudianteId}/pin/restablecer`).set(bearer(docente.token)).send({ pinNuevo: '4826' }).expect(200);

    const activacion = await t.http().post(`${API}/aulas/${aula.body.id}/dispositivos`).set(bearer(docente.token)).send({ nombre: 'Tablet 1' }).expect(201);
    expect(activacion.body.contexto).toEqual({ tipo: 'AULA', nombre: '3.° A' });
    const tablet = activacion.body.tokenDispositivo as string;
    expect(await t.prisma.dispositivoIngreso.findFirstOrThrow({ where: { aulaId: aula.body.id } })).toMatchObject({ cuentaId: docente.id });

    const contexto = await t.http().get(`${API}/acceso-estudiante/contexto-dispositivo`).set('x-dispositivo', tablet).expect(200);
    expect(contexto.body).toEqual({
      contexto: { tipo: 'AULA', nombre: '3.° A' },
      estudiantes: [{ id: tarjeta.body.estudianteId, alias: 'Sofía', avatar: 'buho' }],
    });
    const ingreso = await t.http().post(`${API}/acceso-estudiante/login`).send({
      tokenDispositivo: tablet, perfilId: tarjeta.body.estudianteId, pin: '4826',
    }).expect(200);
    expect(ingreso.body.rol).toBe('ESTUDIANTE');

    // Un estudiante de otra familia no entra desde la tablet del aula aunque conozca su id.
    const familia = await cuentaConSesion('familia2@lectoaventura.test');
    await t.http().post(`${API}/consentimientos`).set(bearer(familia.token)).send({ otorganteNombre: 'Ana Ríos', aceptaPolitica: true }).expect(201);
    const ajeno = await t.http().post(`${API}/estudiantes`).set(bearer(familia.token)).send({ alias: 'Leo', anioNacimiento: 2018, mesNacimiento: 1, avatar: 'koala', pin: '5820' }).expect(201);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo: tablet, perfilId: ajeno.body.id, pin: '5820' }).expect(403);

    // RF-009 / RN-17: la familia no activa aulas; otra docente tampoco activa un aula ajena.
    await t.http().post(`${API}/aulas/${aula.body.id}/dispositivos`).set(bearer(familia.token)).send({ nombre: 'PC' }).expect(403);
    const otraDocente = await cuentaConSesion('docente2@lectoaventura.test', 'DOCENTE');
    await t.http().post(`${API}/aulas/${aula.body.id}/dispositivos`).set(bearer(otraDocente.token)).send({ nombre: 'PC' }).expect(404);

    // RF-020: archivada el aula, su tablet deja de mostrar avatares y de dejar entrar.
    await t.http().post(`${API}/aulas/${aula.body.id}/archivar`).set(bearer(docente.token)).expect(200);
    await t.http().get(`${API}/acceso-estudiante/contexto-dispositivo`).set('x-dispositivo', tablet).expect(403);
    await t.http().post(`${API}/acceso-estudiante/login`).send({
      tokenDispositivo: tablet, perfilId: tarjeta.body.estudianteId, pin: '4826',
    }).expect(403);
    await t.http().post(`${API}/aulas/${aula.body.id}/dispositivos`).set(bearer(docente.token)).send({ nombre: 'Tablet 2' }).expect(404);
  });
});

describe('Recuperación de contraseña (RF-004)', () => {
  it('misma respuesta 202 exista o no la cuenta; el enlace cambia la contraseña y revoca sesiones', async () => {
    const { token } = await cuentaConSesion('recupera@lectoaventura.test');
    const a = await t.http().post(`${API}/auth/recuperar`).send({ email: 'recupera@lectoaventura.test' }).expect(202);
    const b = await t.http().post(`${API}/auth/recuperar`).send({ email: 'nadie@lectoaventura.test' }).expect(202);
    expect(a.body).toEqual(b.body);

    const correos = (await t.http().get(`${API}/dev/correos`)).body as { para: string; asunto: string; enlace: string }[];
    const enlace = correos.find((c) => c.para === 'recupera@lectoaventura.test' && /Recupera/.test(c.asunto))?.enlace as string;
    await t.http()
      .post(`${API}/auth/restablecer`)
      .send({ codigo: new URL(enlace).searchParams.get('codigo'), contrasenaNueva: 'Nueva-Clave-Lectora-1' })
      .expect(200);

    await t.http().get(`${API}/auth/yo`).set(bearer(token)).expect(401);
    await t.http().post(`${API}/auth/login`).send({ email: 'recupera@lectoaventura.test', contrasena: 'Nueva-Clave-Lectora-1' }).expect(200);
  });
});
