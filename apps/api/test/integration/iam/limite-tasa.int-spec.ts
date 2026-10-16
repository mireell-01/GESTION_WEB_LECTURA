import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — RNF-019 integrado: guard global + proxy de confianza (X-Forwarded-For desde loopback).
 */
const API = '/api/v1';
let t: AppDePrueba;

beforeAll(async () => {
  t = await crearApp();
  await vaciarBase(t.prisma);
  process.env['LIMITE_TASA_FACTOR'] = '1';
});

afterAll(async () => {
  process.env['LIMITE_TASA_FACTOR'] = '100';
  await t?.cerrar();
});

const intento = (ip: string) =>
  t.http().post(`${API}/auth/login`).set('X-Forwarded-For', ip).send({ email: 'nadie@lectoaventura.test', contrasena: 'cualquier-cosa' });

describe('Límite de tasa (RNF-019)', () => {
  it('ingreso adulto: los 10 primeros intentos son 401 y el 11.º responde 429 con Retry-After', async () => {
    for (let i = 0; i < 10; i++) await intento('203.0.113.7').expect(401);
    const bloqueado = await intento('203.0.113.7').expect(429);
    expect(bloqueado.body).toMatchObject({ status: 429, type: 'https://lectoaventura.pe/problemas/limite' });
    expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('otra IP (otro dispositivo detrás del proxy) no queda afectada', async () => {
    await intento('198.51.100.20').expect(401);
  });

  it('ingreso del estudiante: 30 intentos por minuto por tablet, aunque cambie la IP', async () => {
    const tablet = 'token-de-una-tablet-que-no-existe-0001';
    const ingreso = (i: number, token = tablet) =>
      t.http().post(`${API}/acceso-estudiante/login`).set('X-Forwarded-For', `10.0.0.${i}`).send({ tokenDispositivo: token, perfilId: 'x', pin: '2580' });
    for (let i = 1; i <= 30; i++) await ingreso(i).expect(403);
    await ingreso(99).expect(429);
    // Otra tablet desde la misma IP sigue pudiendo intentarlo.
    await ingreso(99, 'token-de-otra-tablet-que-no-existe-0002').expect(403);
  });

  it('reenviar la verificación: 1 por minuto por correo (sin importar mayúsculas) y 5 por IP', async () => {
    const reenviar = (ip: string, email: string) =>
      t.http().post(`${API}/auth/verificar-correo/reenviar`).set('X-Forwarded-For', ip).send({ email });
    await reenviar('10.1.0.1', 'ana@lectoaventura.test').expect(202);
    const repetido = await reenviar('10.1.0.2', 'ANA@lectoaventura.test').expect(429);
    expect(repetido.body).toMatchObject({ status: 429, reintentarEnSeg: expect.any(Number) });
    expect(Number(repetido.headers['retry-after'])).toBeGreaterThan(0);

    for (let i = 1; i <= 4; i++) await reenviar('10.1.0.9', `otra${i}@lectoaventura.test`).expect(202);
    await reenviar('10.1.0.9', 'otra5@lectoaventura.test').expect(202);
    await reenviar('10.1.0.9', 'otra6@lectoaventura.test').expect(429);
  });
});
