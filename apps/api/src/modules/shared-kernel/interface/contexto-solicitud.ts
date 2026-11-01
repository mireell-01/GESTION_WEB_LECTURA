import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

interface ContextoSolicitud {
  ip: string | null;
}

const almacen = new AsyncLocalStorage<ContextoSolicitud>();

/**
 * RF-077: la IP del cliente de la solicitud en curso (la real, tras el proxy de confianza), para que
 * la auditoría la registre aunque el evento de la acción no la traiga. Fuera de una solicitud: null.
 */
export function ipDeLaSolicitud(): string | null {
  return almacen.getStore()?.ip ?? null;
}

/** Middleware: guarda el contexto de la solicitud mientras se atiende (también en sus eventos). */
export function contextoSolicitud(req: Request, _res: Response, siguiente: NextFunction): void {
  almacen.run({ ip: req.ip ?? null }, siguiente);
}
