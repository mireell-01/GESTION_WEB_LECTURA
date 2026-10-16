import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Verificación de correo y reenvío del enlace (RF-002) integrados con PostgreSQL:
 * enlaces de un solo uso guardados como huella, el anterior queda reemplazado al reenviar,
 * mensajes claros por motivo y todo sigue funcionando después de reiniciar la API.
 */
const API = '/api/v1';
const CONTRASENA = 'Lectura-Segura-2026';

let t: AppDePrueba;

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
});

afterAll(async () => {
  await t?.cerrar();
});

async function registrar(app: AppDePrueba, email: string) {
  await app.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Ríos', email, contrasena: CONTRASENA, rol: 'FAMILIAR' }).expect(201);
}

/** Enlaces de la bandeja de desarrollo para ese correo, del más reciente al más antiguo. */
async function enlacesDe(app: AppDePrueba, email: string, asunto = /Confirma tu correo/): Promise<string[]> {
  const correos = (await app.http().get(`${API}/dev/correos`).expect(200)).body as { para: string; asunto: string; enlace?: string }[];
  return correos.filter((c) => c.para === email && asunto.test(c.asunto)).map((c) => new URL(c.enlace as string).searchParams.get('codigo') as string);
}

/** Simula que el último enlace se envió hace `seg` segundos (para no esperar el tiempo de espera real). */
async function retrocederUltimoEnlace(app: AppDePrueba, email: string, seg = 120) {
  const cuenta = await app.prisma.cuenta.findUniqueOrThrow({ where: { email } });
  await app.prisma.verificacion.updateMany({ where: { cuentaId: cuenta.id }, data: { creadoEn: new Date(Date.now() - seg * 1000) } });
}

describe('Reenvío del enlace de verificación (RF-002)', () => {
  it('el ingreso de una cuenta sin verificar lo dice claramente (solo con la contraseña correcta)', async () => {
    await registrar(t, 'pendiente@lectoaventura.test');
    const r = await t.http().post(`${API}/auth/login`).send({ email: 'pendiente@lectoaventura.test', contrasena: CONTRASENA }).expect(403);
    expect(r.body).toMatchObject({ detail: 'Tu cuenta aún no está verificada. Revisa tu correo.', motivo: 'CUENTA_NO_VERIFICADA' });
    const mala = await t.http().post(`${API}/auth/login`).send({ email: 'pendiente@lectoaventura.test', contrasena: 'otra-contrasena-cualquiera' });
    expect(mala.status).toBe(401);
  });

  it('responde 202 igual exista o no la cuenta; el enlace nuevo reemplaza al anterior', async () => {
    const email = 'reenvio@lectoaventura.test';
    await registrar(t, email);
    const [primero] = await enlacesDe(t, email);
    await retrocederUltimoEnlace(t, email);

    const inexistente = await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email: 'nadie@lectoaventura.test' }).expect(202);
    const existente = await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email: email.toUpperCase() }).expect(202);
    expect(existente.body).toEqual(inexistente.body);
    expect(existente.body).toEqual({ ok: true, reintentarEnSeg: 60 });

    const [nuevo] = await enlacesDe(t, email);
    expect(nuevo).not.toBe(primero);
    const cuenta = await t.prisma.cuenta.findUniqueOrThrow({ where: { email } });
    const filas = await t.prisma.verificacion.findMany({ where: { cuentaId: cuenta.id }, orderBy: { creadoEn: 'asc' } });
    expect(filas).toHaveLength(2);
    expect(filas.every((f) => /^[0-9a-f]{64}$/.test(f.codigo))).toBe(true);
    expect(filas[0]?.reemplazadoEn).not.toBeNull();
    expect(filas[1]?.reemplazadoEn).toBeNull();

    const reemplazado = await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: primero }).expect(400);
    expect(reemplazado.body).toMatchObject({ motivo: 'REEMPLAZADO', detail: expect.stringMatching(/reemplazado por uno más nuevo/) });
    expect((await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: nuevo }).expect(200)).body).toEqual({ ok: true, estado: 'VERIFICADA' });
    expect((await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: nuevo }).expect(200)).body).toEqual({ ok: true, estado: 'YA_VERIFICADA' });
    await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200);

    const outbox = await t.prisma.outboxEvento.findMany({ where: { agregadoId: cuenta.id } });
    expect(outbox.map((e) => e.tipo)).toEqual(expect.arrayContaining(['iam.VerificacionCorreoReenviada', 'iam.CuentaVerificada']));
  });

  it('dentro de los 60 s no se crea otro enlace aunque se pida', async () => {
    const email = 'espera@lectoaventura.test';
    await registrar(t, email);
    await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email }).expect(202);
    expect(await enlacesDe(t, email)).toHaveLength(1);
  });

  it('un enlace vencido lo explica y se puede pedir otro', async () => {
    const email = 'vencido@lectoaventura.test';
    await registrar(t, email);
    const [codigo] = await enlacesDe(t, email);
    const cuenta = await t.prisma.cuenta.findUniqueOrThrow({ where: { email } });
    await t.prisma.verificacion.updateMany({
      where: { cuentaId: cuenta.id },
      data: { expiraEn: new Date(Date.now() - 1000), creadoEn: new Date(Date.now() - 25 * 3_600_000) },
    });

    const r = await t.http().post(`${API}/auth/verificar-correo`).send({ codigo }).expect(400);
    expect(r.body).toMatchObject({ motivo: 'VENCIDO', detail: 'Este enlace venció. Pide uno nuevo.' });
    await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email }).expect(202);
    const [nuevo] = await enlacesDe(t, email);
    await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: nuevo }).expect(200);
  });

  it('a una cuenta ya verificada le llega un aviso sin enlace de verificación', async () => {
    const email = 'reenvio@lectoaventura.test';
    await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email }).expect(202);
    expect(await enlacesDe(t, email, /ya está verificado/)).toHaveLength(1);
  });

  it('un correo mal escrito se rechaza con 400 en español', async () => {
    const r = await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email: 'no-es-un-correo' }).expect(400);
    expect(r.body.detail).toMatch(/correo electrónico válido/);
  });
});

describe('Verificación después de reiniciar la API', () => {
  it('el enlace sigue funcionando y, si el correo se perdió, se puede pedir otro', async () => {
    await registrar(t, 'antes@lectoaventura.test');
    await registrar(t, 'perdido@lectoaventura.test');
    const [enlaceAntes] = await enlacesDe(t, 'antes@lectoaventura.test');

    // Reinicio: la bandeja de desarrollo (en memoria) se vacía; los enlaces viven en la base.
    await t.cerrar();
    t = await crearApp();
    expect(await enlacesDe(t, 'perdido@lectoaventura.test')).toHaveLength(0);

    expect((await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: enlaceAntes }).expect(200)).body.estado).toBe('VERIFICADA');

    await retrocederUltimoEnlace(t, 'perdido@lectoaventura.test');
    await t.http().post(`${API}/auth/verificar-correo/reenviar`).send({ email: 'perdido@lectoaventura.test' }).expect(202);
    const [nuevo] = await enlacesDe(t, 'perdido@lectoaventura.test');
    await t.http().post(`${API}/auth/verificar-correo`).send({ codigo: nuevo }).expect(200);
    await t.http().post(`${API}/auth/login`).send({ email: 'perdido@lectoaventura.test', contrasena: CONTRASENA }).expect(200);
  });
});
