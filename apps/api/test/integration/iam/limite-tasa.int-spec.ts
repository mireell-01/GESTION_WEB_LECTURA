import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppDePrueba, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — RNF-019 integrado: guard global + proxy de confianza (X-Forwarded-For desde loopback).
 */
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
  t.http().post('/api/iam/sesiones').set('X-Forwarded-For', ip).send({ email: 'nadie@lectoaventura.test', contrasena: 'cualquier-cosa' });

describe('Límite de tasa del ingreso adulto (RNF-019: 10/min por IP)', () => {
  it('los 10 primeros intentos fallan por credenciales (401) y el 11.º responde 429 con Retry-After', async () => {
    for (let i = 0; i < 10; i++) await intento('203.0.113.7').expect(401);
    const bloqueado = await intento('203.0.113.7').expect(429);
    expect(bloqueado.body).toMatchObject({ tipo: 'LIMITE' });
    expect(Number(bloqueado.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('otra IP (otro dispositivo detrás del proxy) no queda afectada', async () => {
    await intento('198.51.100.20').expect(401);
  });

  it('el límite por código de aula aplica al ingreso de estudiantes en el aula', async () => {
    const ingreso = () => t.http().post('/api/escuela/ingreso').send({ codigoAula: 'ZZZZZZ', perfilId: 'x', pin: '2580' });
    for (let i = 0; i < 30; i++) await ingreso().expect(404);
    await ingreso().expect(429);
  });
});
