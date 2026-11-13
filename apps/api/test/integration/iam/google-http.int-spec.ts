import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Argon2HashService } from '../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { uuidV7 } from '../../../src/modules/shared-kernel/public-api';
import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — Ingreso con Google integrado (controllers + guards + caso de uso + Prisma + PostgreSQL), con el
 * "Google de prueba": el navegador sale a la autorización, elige su cuenta y vuelve a /auth/google/callback, que
 * deja la cookie de sesión de siempre (RF-003). Verifica lo guardado en la base y la auditoría.
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

const cookie = (res: { headers: Record<string, unknown> }, nombre: string) =>
  ((res.headers['set-cookie'] as string[] | undefined) ?? []).find((c) => c.startsWith(`${nombre}=`));
const ruta = (url: string) => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};

/** El viaje completo con el navegador: inicio → "Google de prueba" (elige ese correo) → vuelta. */
async function conGoogle(email: string, p: { intencion?: 'ingresar' | 'registrar'; rol?: string; inicio?: { url: string; cookie: string } } = {}) {
  let salida = p.inicio;
  if (!salida) {
    const inicio = await t.http().get(`${API}/auth/google/inicio?intencion=${p.intencion ?? 'ingresar'}${p.rol ? `&rol=${p.rol}` : ''}`).expect(302);
    salida = { url: inicio.headers['location'] as string, cookie: cookie(inicio, 'la_google') as string };
  }
  const autorizar = new URL(salida.url);
  expect(autorizar.pathname).toBe(`${API}/dev/google/autorizar`);
  autorizar.searchParams.set('login_hint', email);
  const vuelta = await t.http().get(ruta(autorizar.toString())).expect(302);
  const fin = await t.http().get(ruta(vuelta.headers['location'] as string)).set('Cookie', salida.cookie.split(';')[0] as string).expect(302);
  return { destino: fin.headers['location'] as string, refresh: cookie(fin, 'la_refresh'), viaje: cookie(fin, 'la_google') };
}

async function cuentaConContrasena(email: string, rol: string, p: { mfa?: boolean } = {}) {
  const cuenta = await t.prisma.cuenta.create({
    data: { id: uuidV7(), nombre: 'Rosa Pérez', email, rol, estado: 'ACTIVA', hashContrasena: await new Argon2HashService().hash(CONTRASENA) },
  });
  if (p.mfa) await t.prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto: authenticator.generateSecret() } });
  return cuenta;
}

describe('[Iam][Core][Slow] Ingreso con Google (docentes y familias)', () => {
  it('sin credenciales reales y fuera de producción está el "Google de prueba"', async () => {
    expect((await t.http().get(`${API}/auth/google/disponible`).expect(200)).body).toEqual({ disponible: true, simulado: true });
  });

  it('la salida a Google deja una cookie del viaje httpOnly, SameSite=Lax, solo para sus rutas, y no revela el verificador PKCE', async () => {
    const inicio = await t.http().get(`${API}/auth/google/inicio?intencion=ingresar`).expect(302);
    const c = cookie(inicio, 'la_google') as string;
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\/api\/v1\/auth\/google/);
    const q = new URL(inicio.headers['location'] as string).searchParams;
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('redirect_uri')).toBe('http://localhost:3002/api/v1/auth/google/callback');
  });

  it('una familia se registra con Google: cuenta ACTIVA y vinculada, sesión abierta en su panel y auditada', async () => {
    const r = await conGoogle('mama.quispe@gmail.com', { intencion: 'registrar', rol: 'FAMILIAR' });
    expect(r.destino).toBe('http://localhost:3002/familia');
    expect(r.refresh).toMatch(/^la_refresh=.+HttpOnly/i);
    expect(r.viaje).toMatch(/^la_google=;/);
    const cuenta = await t.prisma.cuenta.findUniqueOrThrow({ where: { email: 'mama.quispe@gmail.com' } });
    expect(cuenta).toMatchObject({ rol: 'FAMILIAR', estado: 'ACTIVA' });
    expect(cuenta.googleSub).toMatch(/^simulado-/);
    expect(cuenta.hashContrasena).toMatch(/^\$argon2id\$/);
    // La sesión es la de siempre: con su cookie de refresh obtiene su access token.
    const sesion = await t.http().post(`${API}/auth/refresh`).set('Cookie', (r.refresh as string).split(';')[0] as string).expect(200);
    expect(sesion.body).toMatchObject({ rol: 'FAMILIAR', rutaInicial: '/familia' });
    expect(await t.prisma.auditoria.count({ where: { accion: 'CUENTA_GOOGLE_VINCULADA' } })).toBe(0);
  });

  it('una docente con contraseña ingresa con Google: su cuenta queda vinculada (auditado) y la contraseña sigue sirviendo', async () => {
    const docente = await cuentaConContrasena('profe.rosa@colegio.edu.pe', 'DOCENTE');
    const r = await conGoogle('profe.rosa@colegio.edu.pe');
    expect(r.destino).toBe('http://localhost:3002/docente');
    expect((await t.prisma.cuenta.findUniqueOrThrow({ where: { id: docente.id } })).googleSub).toMatch(/^simulado-/);
    expect(await t.prisma.auditoria.count({ where: { accion: 'CUENTA_GOOGLE_VINCULADA', recursoId: docente.id } })).toBe(1);
    await t.http().post(`${API}/auth/login`).send({ email: 'profe.rosa@colegio.edu.pe', contrasena: CONTRASENA }).expect(200);
  });

  it('no abren sesión: sin cuenta, el equipo de contenidos, quien usa MFA ni una vuelta con otra cookie', async () => {
    expect((await conGoogle('nadie@gmail.com')).destino).toBe('http://localhost:3002/ingresar?google=sin-cuenta');
    await cuentaConContrasena('editora@lectoaventura.test', 'EDITOR');
    expect((await conGoogle('editora@lectoaventura.test')).destino).toBe('http://localhost:3002/ingresar?google=no-permitido');
    await cuentaConContrasena('con.mfa@colegio.edu.pe', 'DOCENTE', { mfa: true });
    const conMfa = await conGoogle('con.mfa@colegio.edu.pe');
    expect(conMfa.destino).toBe('http://localhost:3002/ingresar?google=no-permitido');
    expect(conMfa.refresh).toBeUndefined();

    // La vuelta con la cookie de OTRO viaje (p. ej., un enlace que alguien le pasó): no vale.
    const mio = await t.http().get(`${API}/auth/google/inicio?intencion=ingresar`).expect(302);
    const ajeno = await t.http().get(`${API}/auth/google/inicio?intencion=ingresar`).expect(302);
    const r = await conGoogle('profe.rosa@colegio.edu.pe', { inicio: { url: mio.headers['location'] as string, cookie: cookie(ajeno, 'la_google') as string } });
    expect(r.destino).toBe('http://localhost:3002/ingresar?google=vencido');
    expect(r.refresh).toBeUndefined();
  });

  it('desde su panel, una docente vincula y desvincula su cuenta de Google; solo docentes y familias pueden', async () => {
    await cuentaConContrasena('profe.luis@colegio.edu.pe', 'DOCENTE');
    const login = await t.http().post(`${API}/auth/login`).send({ email: 'profe.luis@colegio.edu.pe', contrasena: CONTRASENA }).expect(200);
    const bearer = { Authorization: `Bearer ${login.body.accessToken as string}` };
    expect((await t.http().get(`${API}/auth/google/estado`).set(bearer).expect(200)).body).toEqual({ disponible: true, simulado: true, vinculada: false, puedeUsar: true });

    const vincular = await t.http().post(`${API}/auth/google/vincular`).set(bearer).expect(200);
    const r = await conGoogle('luis.personal@gmail.com', { inicio: { url: vincular.body.url, cookie: cookie(vincular, 'la_google') as string } });
    expect(r.destino).toBe('http://localhost:3002/docente?google=vinculada');
    expect((await t.http().get(`${API}/auth/google/estado`).set(bearer).expect(200)).body).toMatchObject({ vinculada: true });
    // Ya entra con su Google personal, aunque el correo sea otro.
    expect((await conGoogle('luis.personal@gmail.com')).destino).toBe('http://localhost:3002/docente');

    await t.http().post(`${API}/auth/google/desvincular`).set(bearer).expect(200);
    expect((await conGoogle('luis.personal@gmail.com')).destino).toBe('http://localhost:3002/ingresar?google=sin-cuenta');
    expect(await t.prisma.auditoria.count({ where: { accion: 'CUENTA_GOOGLE_DESVINCULADA' } })).toBe(1);

    await cuentaConContrasena('admin@lectoaventura.test', 'EDITOR');
    const editora = await t.http().post(`${API}/auth/login`).send({ email: 'admin@lectoaventura.test', contrasena: CONTRASENA }).expect(200);
    await t.http().post(`${API}/auth/google/vincular`).set({ Authorization: `Bearer ${editora.body.accessToken as string}` }).expect(403);
  });
});
