import type { Request, Response } from 'express';

import { SesionEmitida } from '../../application/dto/iam.dto';

/** Cookie httpOnly del refresh token rotativo (RF-003): JavaScript del navegador no puede leerla. */
export const COOKIE_REFRESH = 'la_refresh';
const RUTA_COOKIE = '/api/iam/sesiones';
const SIETE_DIAS_MS = 7 * 86_400_000;

export function leerCookie(req: Request, nombre: string): string | undefined {
  const cabecera = req.headers.cookie;
  if (!cabecera) return undefined;
  for (const parte of cabecera.split(';')) {
    const [clave, ...valor] = parte.trim().split('=');
    if (clave === nombre) return decodeURIComponent(valor.join('='));
  }
  return undefined;
}

/**
 * Deja el refresh token en cookie y devuelve el cuerpo de respuesta sin él.
 * Estudiantes: cookie de sesión (se borra al cerrar el navegador del dispositivo compartido, R-02).
 */
export function responderSesion(res: Response, sesion: SesionEmitida): Omit<SesionEmitida, 'refreshToken'> {
  const { refreshToken, ...cuerpo } = sesion;
  res.cookie(COOKIE_REFRESH, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env['NODE_ENV'] === 'production',
    path: RUTA_COOKIE,
    maxAge: sesion.rol === 'ESTUDIANTE' ? undefined : SIETE_DIAS_MS,
  });
  return cuerpo;
}

export function borrarCookieRefresh(res: Response): void {
  res.clearCookie(COOKIE_REFRESH, { path: RUTA_COOKIE });
}
