import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { diaLima } from './escuela';

/** Ayudantes del Módulo 8 (gamificación): leer el libro de puntos, las insignias y la racha en la base. */

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

async function conBase<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = db();
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** RF-056: los asientos del libro de puntos del niño, en orden. */
export function asientosDe(estudianteId: string): Promise<{ motivo: string; puntos: number }[]> {
  return conBase((p) => p.asientoPuntos.findMany({ where: { estudianteId }, orderBy: { id: 'asc' }, select: { motivo: true, puntos: true } }));
}

/** Saldo de puntos = suma del libro (SRS §6, CuentaGamificacion). */
export async function puntosGuardados(estudianteId: string): Promise<number> {
  return (await asientosDe(estudianteId)).reduce((s, a) => s + a.puntos, 0);
}

/** UAT-03: el avance guardado hacia una insignia que se gana contando. */
export function avanceInsignia(estudianteId: string, codigo: string): Promise<number> {
  return conBase(async (p) => (await p.avanceInsignia.findFirst({ where: { estudianteId, insignia: { codigo } } }))?.avance ?? 0);
}

/** RF-061: simula que el niño leyó `dias` días seguidos hasta hace `hastaHaceDias` días (sin usar el comodín). */
export function fijarRacha(estudianteId: string, dias: number, hastaHaceDias: number): Promise<unknown> {
  const datos = { diasActuales: dias, mejorRacha: dias, ultimaFechaLima: new Date(`${diaLima(-hastaHaceDias)}T00:00:00Z`), comodinUsadoSemana: null };
  return conBase((p) => p.racha.upsert({ where: { estudianteId }, create: { estudianteId, ...datos }, update: datos }));
}

export function rachaGuardada(estudianteId: string) {
  return conBase((p) => p.racha.findUnique({ where: { estudianteId } }));
}
