import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { RolesGuard } from '../../../../src/modules/iam/interface/http/guards';
import {
  ES_PUBLICO,
  PERMITE_SIN_MFA,
  ProhibidoError,
  ROLES_PERMITIDOS,
  UsuarioAutenticado,
} from '../../../../src/modules/shared-kernel/public-api';

/** Contexto HTTP mínimo con metadatos de handler/clase controlados. */
function contexto(usuario: UsuarioAutenticado | undefined, metadatos: Record<string, unknown>): {
  ctx: ExecutionContext;
  reflector: Reflector;
} {
  const handler = () => undefined;
  const reflector = {
    getAllAndOverride: (clave: string) => metadatos[clave],
  } as unknown as Reflector;
  const ctx = {
    getHandler: () => handler,
    getClass: () => Object,
    switchToHttp: () => ({ getRequest: () => ({ user: usuario }) }),
  } as unknown as ExecutionContext;
  return { ctx, reflector };
}

const usuario = (rol: UsuarioAutenticado['rol'], mfa = false): UsuarioAutenticado => ({ sub: 'u1', rol, mfa, sid: 's1' });

describe('RolesGuard (RF-009, RF-011)', () => {
  it('deja pasar endpoints públicos sin usuario', () => {
    const { ctx, reflector } = contexto(undefined, { [ES_PUBLICO]: true });
    expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
  });

  it('permite el rol declarado y rechaza otro rol con 403', () => {
    const familiar = contexto(usuario('FAMILIAR'), { [ROLES_PERMITIDOS]: ['FAMILIAR'] });
    expect(new RolesGuard(familiar.reflector).canActivate(familiar.ctx)).toBe(true);

    const estudiante = contexto(usuario('ESTUDIANTE'), { [ROLES_PERMITIDOS]: ['FAMILIAR'] });
    expect(() => new RolesGuard(estudiante.reflector).canActivate(estudiante.ctx)).toThrow(ProhibidoError);
  });

  it('backoffice sin MFA: bloqueado salvo en endpoints @PermiteSinMfa', () => {
    const sinMfa = contexto(usuario('EDITOR', false), { [ROLES_PERMITIDOS]: ['EDITOR'] });
    expect(() => new RolesGuard(sinMfa.reflector).canActivate(sinMfa.ctx)).toThrow(/MFA/);

    const configurando = contexto(usuario('EDITOR', false), { [PERMITE_SIN_MFA]: true });
    expect(new RolesGuard(configurando.reflector).canActivate(configurando.ctx)).toBe(true);

    const conMfa = contexto(usuario('EDITOR', true), { [ROLES_PERMITIDOS]: ['EDITOR'] });
    expect(new RolesGuard(conMfa.reflector).canActivate(conMfa.ctx)).toBe(true);
  });

  it('docentes y familias no necesitan MFA (es opcional para ellos)', () => {
    const docente = contexto(usuario('DOCENTE', false), {});
    expect(new RolesGuard(docente.reflector).canActivate(docente.ctx)).toBe(true);
  });
});
