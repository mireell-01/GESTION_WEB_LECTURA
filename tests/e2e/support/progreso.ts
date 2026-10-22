import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

/** Ayudantes del Módulo 7 (perfil lector): leer la maestría y su historial en la base. */

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/** RF-053: la maestría guardada de una habilidad y sus cambios, del más antiguo al más reciente. */
export async function maestriaGuardada(estudianteId: string, habilidad: string) {
  const prisma = db();
  try {
    const [fila, historial] = await Promise.all([
      prisma.maestriaHabilidad.findUnique({ where: { estudianteId_habilidad: { estudianteId, habilidad } } }),
      prisma.historialMaestria.findMany({ where: { estudianteId, habilidad }, orderBy: { id: 'asc' } }),
    ]);
    return {
      valor: fila ? Number(fila.valor) : null,
      itemsContados: fila?.itemsContados ?? 0,
      cambios: historial.map((h) => ({ origen: h.origen, anterior: Number(h.valorAnterior), nuevo: Number(h.valorNuevo) })),
    };
  } finally {
    await prisma.$disconnect();
  }
}
