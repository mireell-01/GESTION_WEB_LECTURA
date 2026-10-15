import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

/**
 * Decoradores de autorización compartidos por todos los controllers.
 * La verificación del token la hace el guard global de IAM; aquí solo se declara la intención.
 */
export type RolUsuario =
  | 'ESTUDIANTE'
  | 'DOCENTE'
  | 'FAMILIAR'
  | 'EDITOR'
  | 'REVISOR'
  | 'ADMIN_PLATAFORMA';

export const ROLES_BACKOFFICE: readonly RolUsuario[] = ['EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA'];

/** Datos del usuario autenticado que el guard deja en `request.user`. */
export interface UsuarioAutenticado {
  /** Id de la cuenta adulta o del perfil de estudiante. */
  sub: string;
  rol: RolUsuario;
  /** true si la sesión se abrió con MFA verificado (RF-011). */
  mfa: boolean;
  /** Id de la sesión (permite revocarla, RF-010). */
  sid: string;
}

export const ES_PUBLICO = 'la:publico';
export const ROLES_PERMITIDOS = 'la:roles';
export const PERMITE_SIN_MFA = 'la:sin-mfa';

/** Endpoint accesible sin autenticación. */
export const Publico = () => SetMetadata(ES_PUBLICO, true);

/**
 * El endpoint admite sesiones de backoffice que aún no verificaron MFA
 * (configurar MFA, cerrar sesión, ver el propio usuario). RF-011.
 */
export const PermiteSinMfa = () => SetMetadata(PERMITE_SIN_MFA, true);

/** Restringe el endpoint a los roles indicados (RF-009: otro rol recibe 403). */
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_PERMITIDOS, roles);

/** Inyecta el usuario autenticado en el parámetro del handler. */
export const UsuarioActual = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): UsuarioAutenticado =>
    contexto.switchToHttp().getRequest<{ user: UsuarioAutenticado }>().user,
);
