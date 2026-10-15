import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const ID_VALIDO = /^[A-Za-z0-9-]{8,64}$/;

/**
 * Middleware X-Request-Id (convención del SRS §7, trazabilidad RNF-028): reutiliza el id que llega
 * del proxy si es válido o genera uno, y lo devuelve en todas las respuestas.
 */
export function idPeticion(req: Request, res: Response, siguiente: NextFunction): void {
  const recibido = req.headers['x-request-id'];
  const id = typeof recibido === 'string' && ID_VALIDO.test(recibido) ? recibido : randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('X-Request-Id', id);
  siguiente();
}
