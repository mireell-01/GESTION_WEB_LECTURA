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

  it('ingreso del estudiante: 30 intentos por minuto por código de aula, aunque cambie la IP', async () => {
    const ingreso = (i: number) =>
      t.http().post(`${API}/acceso-estudiante/login`).set('X-Forwarded-For', `10.0.0.${i}`).send({ codigoAula: 'ZZZZZZ', perfilId: 'x', pin: '2580' });
    for (let i = 1; i <= 30; i++) await ingreso(i).expect(404);
    await ingreso(99).expect(429);
  });
});
