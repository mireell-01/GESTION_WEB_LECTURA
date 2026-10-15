import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ErrorDeNegocio,
  LIMITE_TASA,
  LimiteTasaGuard,
  ReglaLimiteTasa,
} from '../../../../src/modules/shared-kernel/public-api';

/** Nivel 1 — RNF-019: limitación de tasa (login adulto 10/min por IP; PIN 30/min por código de aula). */
function peticion(regla: ReglaLimiteTasa | undefined, req: { ip?: string; body?: unknown }) {
  const cabeceras: Record<string, string> = {};
  const reflector = { get: (clave: string) => (clave === LIMITE_TASA ? regla : undefined) } as unknown as Reflector;
  const ctx = {
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ setHeader: (k: string, v: string) => (cabeceras[k] = v) }) }),
  } as unknown as ExecutionContext;
  return { reflector, ctx, cabeceras };
}

const LOGIN: ReglaLimiteTasa = { nombre: 'ingreso-adulto', maximoPorMinuto: 10, por: 'ip' };
const AULA: ReglaLimiteTasa = { nombre: 'ingreso-aula', maximoPorMinuto: 30, por: { campoCuerpo: 'codigoAula' } };

describe('LimiteTasaGuard (RNF-019)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T15:00:00Z'));
    delete process.env['LIMITE_TASA_FACTOR'];
  });

  afterEach(() => vi.useRealTimers());

  it('sin regla declarada no limita', () => {
    const { reflector, ctx } = peticion(undefined, { ip: '1.1.1.1' });
    const guard = new LimiteTasaGuard(reflector);
    for (let i = 0; i < 100; i++) expect(guard.canActivate(ctx)).toBe(true);
  });

  it('el intento 11 del minuto desde la misma IP responde LIMITE con Retry-After', () => {
    const { reflector, ctx, cabeceras } = peticion(LOGIN, { ip: '10.0.0.1' });
    const guard = new LimiteTasaGuard(reflector);
    for (let i = 0; i < 10; i++) expect(guard.canActivate(ctx)).toBe(true);

    vi.advanceTimersByTime(20_000);
    const error = (() => {
      try {
        guard.canActivate(ctx);
      } catch (e) {
        return e as ErrorDeNegocio;
      }
    })();
    expect(error).toBeInstanceOf(ErrorDeNegocio);
    expect(error?.tipo).toBe('LIMITE');
    expect(error?.detalle).toEqual({ reintentarEnSeg: 40 });
    expect(cabeceras['Retry-After']).toBe('40');
  });

  it('cada IP tiene su propio contador y la ventana se reinicia al minuto', () => {
    const guard = new LimiteTasaGuard(peticion(LOGIN, {}).reflector);
    const a = peticion(LOGIN, { ip: '10.0.0.1' }).ctx;
    const b = peticion(LOGIN, { ip: '10.0.0.2' }).ctx;
    for (let i = 0; i < 10; i++) guard.canActivate(a);
    expect(() => guard.canActivate(a)).toThrow(ErrorDeNegocio);
    expect(guard.canActivate(b)).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(guard.canActivate(a)).toBe(true);
  });

  it('el ingreso por aula cuenta por código (sin distinguir mayúsculas), no por IP', () => {
    const guard = new LimiteTasaGuard(peticion(AULA, {}).reflector);
    for (let i = 0; i < 30; i++) {
      guard.canActivate(peticion(AULA, { ip: `10.0.0.${i}`, body: { codigoAula: i % 2 ? 'abc234' : 'ABC234' } }).ctx);
    }
    expect(() => guard.canActivate(peticion(AULA, { ip: '10.9.9.9', body: { codigoAula: 'ABC234' } }).ctx)).toThrow(/Demasiados intentos/);
    expect(guard.canActivate(peticion(AULA, { ip: '10.9.9.9', body: { codigoAula: 'XYZ789' } }).ctx)).toBe(true);
  });

  it('LIMITE_TASA_FACTOR multiplica el máximo en entornos de prueba de carga', () => {
    process.env['LIMITE_TASA_FACTOR'] = '3';
    const { reflector, ctx } = peticion(LOGIN, { ip: '10.0.0.1' });
    const guard = new LimiteTasaGuard(reflector);
    for (let i = 0; i < 30; i++) expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(ErrorDeNegocio);
  });
});
