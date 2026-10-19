import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AlmacenDiscoLocal } from '../../../../src/modules/contenido/infrastructure/almacen/almacen-disco-local';
import { FirmadorSubidasHmac } from '../../../../src/modules/contenido/infrastructure/almacen/firmador-subidas-hmac';

/** Nivel 1 — Adaptadores de Contenido: firma de subidas (URL prefirmada) y almacén local (RF-023). */
describe('FirmadorSubidasHmac', () => {
  const firmador = new FirmadorSubidasHmac('secreto-de-pruebas-de-contenido-con-mas-de-32-caracteres');
  const ahora = new Date('2026-10-20T15:00:00Z');
  const vence = new Date(ahora.getTime() + 60_000);

  it('devuelve los datos firmados mientras no venza', () => {
    const token = firmador.firmar({ recursoId: 'r1', bytes: 10 }, vence);
    expect(firmador.verificar(token, ahora)).toEqual({ recursoId: 'r1', bytes: 10 });
    expect(firmador.verificar(token, vence)).toBeNull();
  });

  it('cualquier cambio en los datos o la firma la invalida', () => {
    const token = firmador.firmar({ recursoId: 'r1', bytes: 10 }, vence);
    const [cuerpo, firma] = token.split('.');
    const alterado = Buffer.from(JSON.stringify({ recursoId: 'r1', bytes: 999_999, exp: vence.getTime() })).toString('base64url');
    expect(firmador.verificar(`${alterado}.${firma}`, ahora)).toBeNull();
    expect(firmador.verificar(`${cuerpo}.${firma}x`, ahora)).toBeNull();
    expect(firmador.verificar('sin-punto', ahora)).toBeNull();
    expect(new FirmadorSubidasHmac('otro-secreto-de-pruebas-con-mas-de-32-caracteres').verificar(token, ahora)).toBeNull();
  });

  it('exige un secreto de al menos 32 caracteres', () => {
    expect(() => new FirmadorSubidasHmac('corto')).toThrow(/32/);
  });
});

describe('AlmacenDiscoLocal', () => {
  let carpeta: string;
  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'almacen-'));
  });
  afterAll(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  it('guarda y lee por clave; una clave inexistente devuelve null', async () => {
    const almacen = new AlmacenDiscoLocal(carpeta);
    await almacen.guardar('lecturas/l1/r1.webp', Buffer.from('datos'));
    expect((await almacen.leer('lecturas/l1/r1.webp'))?.toString()).toBe('datos');
    expect(await almacen.leer('lecturas/l1/no.webp')).toBeNull();
  });

  it('no permite salir de su carpeta', async () => {
    const almacen = new AlmacenDiscoLocal(carpeta);
    await expect(almacen.guardar('../fuera.txt', Buffer.from('x'))).rejects.toThrow(/inválida/);
    expect(await almacen.leer('../../etc/passwd')).toBeNull();
  });
});
