import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import { ErrorDeNegocio, TipoErrorNegocio } from '../domain/errors/error-de-negocio';

const ESTADO_POR_TIPO: Record<TipoErrorNegocio, number> = {
  VALIDACION: HttpStatus.BAD_REQUEST,
  NO_AUTENTICADO: HttpStatus.UNAUTHORIZED,
  PROHIBIDO: HttpStatus.FORBIDDEN,
  NO_ENCONTRADO: HttpStatus.NOT_FOUND,
  CONFLICTO: HttpStatus.CONFLICT,
  BLOQUEADO: 423,
  LIMITE: HttpStatus.TOO_MANY_REQUESTS,
};

/**
 * Filtro global: traduce errores de negocio a HTTP con un cuerpo uniforme `{ mensaje, tipo, detalle }`.
 * Los errores inesperados se registran y se responden como 500 sin filtrar detalles internos.
 */
@Catch()
export class FiltroErrores implements ExceptionFilter {
  private readonly logger = new Logger('FiltroErrores');

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (excepcion instanceof ErrorDeNegocio) {
      res.status(ESTADO_POR_TIPO[excepcion.tipo]).json({
        mensaje: excepcion.message,
        tipo: excepcion.tipo,
        detalle: excepcion.detalle,
      });
      return;
    }

    if (excepcion instanceof HttpException) {
      const cuerpo = excepcion.getResponse() as string | { message?: string | string[] };
      const mensaje =
        typeof cuerpo === 'string'
          ? cuerpo
          : Array.isArray(cuerpo.message)
            ? cuerpo.message.join('. ')
            : (cuerpo.message ?? excepcion.message);
      res.status(excepcion.getStatus()).json({ mensaje });
      return;
    }

    this.logger.error((excepcion as Error)?.message, (excepcion as Error)?.stack);
    res
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json({ mensaje: 'Ocurrió un error inesperado. Inténtalo de nuevo.' });
  }
}
