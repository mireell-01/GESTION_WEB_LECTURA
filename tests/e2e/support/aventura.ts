import { resolve } from 'node:path';

import { APIRequestContext, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { CuentaBackoffice, lecturaPublicada, sesionBackoffice } from './contenido';
import { MARCA_CONTENIDO_E2E } from './escuela';

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/** Título único de una misión de prueba; la marca "Prueba E2E" hace que la limpieza la borre. */
export const tituloMision = (titulo: string) => `${MARCA_CONTENIDO_E2E}: ${titulo} ${Date.now().toString(36)}`;

/** Id de un mundo del catálogo (los 5 que carga la migración). */
export async function idMundo(numero: number): Promise<string> {
  const prisma = db();
  try {
    return (await prisma.mundo.findUniqueOrThrow({ where: { numero } })).id;
  } finally {
    await prisma.$disconnect();
  }
}

/** Una misión de 8–9 años armada por la API del backoffice con lecturas nuevas publicadas. */
export async function misionConLecturas(
  request: APIRequestContext,
  editora: CuentaBackoffice,
  numeroMundo: number,
  titulo: string,
  lecturas: string[],
): Promise<{ misionId: string; titulo: string; lecturas: string[] }> {
  const sufijo = Date.now().toString(36);
  const ids: string[] = [];
  const titulos: string[] = [];
  for (const t of lecturas) {
    const l = await lecturaPublicada(request, { titulo: `${t} ${sufijo}`, tematica: `Aventura ${sufijo}` });
    ids.push(l.lecturaId);
    titulos.push(l.titulo);
  }
  const r = await request.post(`/api/v1/backoffice/mundos/${await idMundo(numeroMundo)}/misiones`, {
    headers: await sesionBackoffice(request, editora),
    data: { rangoEdad: 'R2', titulo, lecturaIds: ids },
  });
  expect(r.status(), await r.text()).toBe(201);
  return { misionId: (await r.json()).id, titulo, lecturas: titulos };
}

/**
 * RF-031: deja al niño como lo dejará el evento de los Módulos 6 y 7 al cumplir el umbral (RN-09):
 * los mundos anteriores completados y este disponible, con la celebración aún sin ver. La regla en
 * sí se prueba en los niveles 1 y 2 con los eventos reales; aquí se prueba lo que ve el niño.
 */
export async function simularDesbloqueo(estudianteId: string, numero: number): Promise<void> {
  const prisma = db();
  try {
    const ahora = new Date();
    const mundos = await prisma.mundo.findMany({ where: { numero: { lte: numero } } });
    await prisma.$transaction(
      mundos.map((m) =>
        prisma.progresoMundo.update({
          where: { estudianteId_mundoId: { estudianteId, mundoId: m.id } },
          data: m.numero < numero ? { estado: 'COMPLETADO', completadoEn: ahora } : { estado: 'DISPONIBLE', desbloqueadoEn: ahora, celebradoEn: null },
        }),
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}
