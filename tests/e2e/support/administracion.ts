import { resolve } from 'node:path';

import { APIRequestContext, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/**
 * Ayudantes del Módulo 12 (administración de la plataforma): nombres de institución de prueba (la
 * limpieza final las borra), el correo de alta de un docente y deshacer los parámetros publicados en
 * una prueba para que las siguientes jueguen con los de siempre.
 */

/** Prefijo de las instituciones creadas por las pruebas: la limpieza final las borra. */
export const PREFIJO_INSTITUCION_E2E = 'IE Prueba E2E';

export function institucionDePrueba(): string {
  return `${PREFIJO_INSTITUCION_E2E} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** El enlace para crear la contraseña que recibió un docente dado de alta (bandeja de desarrollo). */
export async function enlaceDeAlta(request: APIRequestContext, email: string): Promise<string> {
  const correos = (await (await request.get('/api/v1/dev/correos')).json()) as { para: string; asunto: string; enlace?: string }[];
  const correo = correos.find((c) => c.para === email && c.asunto === 'Tu cuenta de docente en LectoAventura');
  expect(correo?.enlace, 'el correo de alta').toBeTruthy();
  return correo!.enlace as string;
}

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/** RF-078: deja vigentes los parámetros de siempre (borra las versiones que publicó la prueba). */
export async function deshacerParametrosPublicados(desdeVersion: number): Promise<void> {
  const prisma = db();
  try {
    await prisma.parametroGamificacion.deleteMany({ where: { version: { gt: desdeVersion } } });
  } finally {
    await prisma.$disconnect();
  }
}

/** RF-077: los registros de auditoría de una acción sobre un recurso (lo que ve la administración). */
export async function auditoriaDe(accion: string, recursoId: string) {
  const prisma = db();
  try {
    return await prisma.auditoria.findMany({ where: { accion, recursoId }, orderBy: { ocurridoEn: 'asc' } });
  } finally {
    await prisma.$disconnect();
  }
}
