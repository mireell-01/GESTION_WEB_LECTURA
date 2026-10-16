import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { ErrorDeNegocio, TipoErrorNegocio } from '../domain/errors/error-de-negocio';
import { redactar } from '../infrastructure/redaccion';

const ESTADO_POR_TIPO: Record<TipoErrorNegocio, number> = {
  VALIDACION: HttpStatus.BAD_REQUEST,
  NO_AUTENTICADO: HttpStatus.UNAUTHORIZED,
  PROHIBIDO: HttpStatus.FORBIDDEN,
  NO_ENCONTRADO: HttpStatus.NOT_FOUND,
  CONFLICTO: HttpStatus.CONFLICT,
  BLOQUEADO: 423,
  LIMITE: HttpStatus.TOO_MANY_REQUESTS,
};

const TIPO_POR_ESTADO: Record<number, TipoErrorNegocio> = Object.fromEntries(
  Object.entries(ESTADO_POR_TIPO).map(([tipo, estado]) => [estado, tipo as TipoErrorNegocio]),
);

const TITULO: Record<TipoErrorNegocio, string> = {
  VALIDACION: 'Datos no válidos',
  NO_AUTENTICADO: 'Sesión requerida',
  PROHIBIDO: 'Acceso denegado',
  NO_ENCONTRADO: 'Recurso no encontrado',
  CONFLICTO: 'Conflicto con el estado actual',
  BLOQUEADO: 'Recurso bloqueado temporalmente',
  LIMITE: 'Demasiadas solicitudes',
};

/** Documento RFC 9457 (Problem Details), con miembros de extensión para la interfaz. */
interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  requestId?: string;
  [extension: string]: unknown;
}

function problema(req: Request, estado: number, tipo: TipoErrorNegocio | undefined, detail: string, extension?: Record<string, unknown>): ProblemDetails {
  return {
    ...extension,
    type: tipo ? `https://lectoaventura.pe/problemas/${tipo.toLowerCase().replace(/_/g, '-')}` : 'about:blank',
    title: tipo ? TITULO[tipo] : 'Error interno',
    status: estado,
    detail,
    // Solo la ruta: la consulta puede llevar códigos de un solo uso o firmas.
    instance: req.path,
    requestId: req.headers['x-request-id'] as string | undefined,
  };
}

/**
 * Filtro global: responde todos los errores como Problem Details (convención del SRS §7)
 * y registra los inesperados sin secretos (RNF-031) y con su X-Request-Id (RNF-028).
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger('FiltroErrores');

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    let cuerpo: ProblemDetails;

    if (excepcion instanceof ErrorDeNegocio) {
      cuerpo = problema(req, ESTADO_POR_TIPO[excepcion.tipo], excepcion.tipo, excepcion.message, excepcion.detalle);
    } else if (excepcion instanceof HttpException) {
      const respuesta = excepcion.getResponse() as string | { message?: string | string[] };
      const detail =
        typeof respuesta === 'string'
          ? respuesta
          : Array.isArray(respuesta.message)
            ? respuesta.message.join('. ')
            : (respuesta.message ?? excepcion.message);
      cuerpo = problema(req, excepcion.getStatus(), TIPO_POR_ESTADO[excepcion.getStatus()], detail);
    } else if ((excepcion as { code?: unknown } | undefined)?.code === 'P2023') {
      // Prisma P2023: un id con formato inválido para una columna UUID. Ese recurso no existe.
      cuerpo = problema(req, HttpStatus.NOT_FOUND, 'NO_ENCONTRADO', 'Recurso no encontrado');
    } else {
      const error = excepcion as Error | undefined;
      this.logger.error(
        redactar(`[${req.headers['x-request-id'] ?? '-'}] ${req.method} ${req.path}: ${error?.message ?? String(excepcion)}`),
        error?.stack ? redactar(error.stack) : undefined,
      );
      cuerpo = problema(req, HttpStatus.INTERNAL_SERVER_ERROR, undefined, 'Ocurrió un error inesperado. Inténtalo de nuevo.');
    }

    res.status(cuerpo.status).type('application/problem+json').json(cuerpo);
  }
}
