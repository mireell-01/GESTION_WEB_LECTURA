import { CallHandler, ExecutionContext, Inject, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { from, mergeMap, Observable } from 'rxjs';

import { AUDITAR, ipDeLaSolicitud, redactar, ReglaAuditoria, UsuarioAutenticado } from '../../shared-kernel/public-api';
import { CASOS_USO_ADMINISTRACION, CasosUsoAdministracion } from '../application/casos-uso-administracion';

/**
 * RF-077: registra en la auditoría los accesos a datos sensibles (endpoints marcados con @Auditar)
 * cuando responden bien: quién, con qué rol, desde qué IP y a qué recurso. Se registra antes de
 * entregar la respuesta; si la auditoría falla, el acceso no se niega pero queda en el registro de errores.
 */
@Injectable()
export class AuditoriaAccesosInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Auditoria');

  constructor(
    private readonly reflector: Reflector,
    @Inject(CASOS_USO_ADMINISTRACION) private readonly casos: CasosUsoAdministracion,
  ) {}

  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    const regla = this.reflector.get<ReglaAuditoria | undefined>(AUDITAR, contexto.getHandler());
    if (!regla) return siguiente.handle();
    const req = contexto.switchToHttp().getRequest<Request & { user?: UsuarioAutenticado }>();
    return siguiente.handle().pipe(mergeMap((respuesta) => from(this.registrar(regla, req).then(() => respuesta))));
  }

  private async registrar(regla: ReglaAuditoria, req: Request & { user?: UsuarioAutenticado }): Promise<void> {
    try {
      await this.casos.registrarAuditoria.ejecutar({
        actorId: req.user?.sub ?? null,
        actorRol: req.user?.rol ?? null,
        accion: regla.accion,
        recursoTipo: regla.recurso,
        recursoId: regla.parametro ? (String(req.params[regla.parametro] ?? '') || null) : null,
        ip: ipDeLaSolicitud(),
        datos: { ruta: req.route?.path ?? req.path },
        ocurridoEn: new Date(),
      });
    } catch (error) {
      this.logger.error(redactar(`No se pudo auditar ${regla.accion}: ${(error as Error).message}`));
    }
  }
}
