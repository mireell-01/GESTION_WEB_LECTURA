import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import {
  ES_PUBLICO,
  PERMITE_SIN_MFA,
  ProhibidoError,
  ROLES_BACKOFFICE,
  ROLES_PERMITIDOS,
  RolUsuario,
  UsuarioAutenticado,
} from '../../../shared-kernel/public-api';
import { CASOS_USO_IAM, CasosUsoIam } from '../../application/casos-uso-iam';

type SolicitudConUsuario = Request & { user?: UsuarioAutenticado };

function tokenBearer(req: Request): string | undefined {
  const cabecera = req.headers.authorization;
  return cabecera?.startsWith('Bearer ') ? cabecera.slice(7) : undefined;
}

/**
 * Guard global de autenticación: todo endpoint exige sesión válida salvo los marcados @Publico().
 * Una sesión revocada o vencida por inactividad responde 401 (RF-010).
 */
@Injectable()
export class AutenticacionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CASOS_USO_IAM) private readonly iam: CasosUsoIam,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<SolicitudConUsuario>();
    const esPublico = this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (esPublico) {
      return true;
    }
    req.user = await this.iam.validarAcceso.ejecutar(tokenBearer(req));
    return true;
  }
}

/**
 * Guard global de autorización por rol (RF-009): un rol que entra a rutas de otro recibe 403.
 * RF-011: los roles de backoffice sin MFA verificado solo acceden a lo marcado @PermiteSinMfa().
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const objetivos = [contexto.getHandler(), contexto.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ES_PUBLICO, objetivos)) {
      return true;
    }
    const usuario = contexto.switchToHttp().getRequest<SolicitudConUsuario>().user;
    if (!usuario) {
      throw new ProhibidoError();
    }

    const permiteSinMfa = this.reflector.getAllAndOverride<boolean>(PERMITE_SIN_MFA, objetivos);
    if (ROLES_BACKOFFICE.includes(usuario.rol) && !usuario.mfa && !permiteSinMfa) {
      throw new ProhibidoError('Configura la verificación en dos pasos (MFA) para entrar al backoffice');
    }

    const roles = this.reflector.getAllAndOverride<RolUsuario[]>(ROLES_PERMITIDOS, objetivos);
    if (roles && roles.length > 0 && !roles.includes(usuario.rol)) {
      throw new ProhibidoError();
    }
    return true;
  }
}
