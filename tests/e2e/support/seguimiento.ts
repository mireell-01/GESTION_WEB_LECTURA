import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

/**
 * Ayudantes del Módulo 9 (seguimiento docente): la maestría que habría medido Progreso, el paso del
 * tiempo sin leer y el refresco de las vistas de reportes (el worker lo hace cada 5 minutos).
 */

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

const HABILIDADES = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'] as const;

type Valores = Partial<Record<(typeof HABILIDADES)[number], number>>;

/** La maestría de un estudiante en las 5 habilidades (70 donde no se indique), con `items` preguntas cada una. */
export function sembrarMaestria(estudianteId: string, valores: Valores, items = 6): Promise<void> {
  return sembrarMaestrias([{ estudianteId, valores }], items);
}

/** Lo mismo para varios estudiantes con una sola conexión (aulas de 30 o 40). */
export function sembrarMaestrias(lista: { estudianteId: string; valores: Valores }[], items = 6): Promise<void> {
  return conBase(async (p) => {
    for (const { estudianteId, valores } of lista) {
      for (const habilidad of HABILIDADES) {
        const valor = valores[habilidad] ?? 70;
        await p.maestriaHabilidad.upsert({
          where: { estudianteId_habilidad: { estudianteId, habilidad } },
          create: { estudianteId, habilidad, valor, itemsContados: items, actualizadoEn: new Date() },
          update: { valor, itemsContados: items },
        });
      }
    }
  });
}

/** RF-065: lleva `dias` días sin actividad (sus sesiones y su reto inicial quedan en el pasado). */
export function sinActividadDesde(estudianteId: string, dias: number): Promise<void> {
  const fecha = new Date(Date.now() - dias * 86_400_000);
  return conBase(async (p) => {
    await p.sesionLectura.updateMany({ where: { estudianteId }, data: { iniciadaEn: fecha, ultimaActividadEn: fecha } });
    await p.respuestaDiagnostico.updateMany({ where: { diagnostico: { estudianteId } }, data: { respondidaEn: fecha } });
    await p.matricula.updateMany({ where: { estudianteId }, data: { creadaEn: fecha } });
  });
}

/** Lo que hace el worker de reportes cada 5 minutos (SRS §7). */
export function refrescarVistas(): Promise<unknown> {
  return conBase((p) => p.$executeRawUnsafe('SELECT "reporting"."refrescar_vistas"()'));
}

/** RF-066: los estudiantes a los que quedó asignada la lectura de refuerzo. */
export function destinatariosDeAsignaciones(aulaId: string): Promise<string[]> {
  return conBase(async (p) => (await p.asignacionDestinatario.findMany({ where: { asignacion: { aulaId } }, select: { estudianteId: true } })).map((d) => d.estudianteId).sort());
}
