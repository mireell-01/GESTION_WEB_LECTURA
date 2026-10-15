import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { DOMINIO_E2E } from './iam';

/**
 * Teardown global: borra las cuentas creadas por las pruebas (dominio e2e.lectoaventura.test)
 * y todo lo que depende de ellas, para no ensuciar la base del entorno.
 */
export default async function limpieza(): Promise<void> {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  const prisma = new PrismaClient();
  try {
    const cuentas = await prisma.cuenta.findMany({ where: { email: { endsWith: `@${DOMINIO_E2E}` } }, select: { id: true } });
    const idsCuentas = cuentas.map((c) => c.id);
    const perfiles = await prisma.perfilEstudiante.findMany({ where: { cuentaResponsableId: { in: idsCuentas } }, select: { id: true } });
    const idsPerfiles = perfiles.map((p) => p.id);
    const sujetos = [...idsCuentas, ...idsPerfiles];
    const sesiones = await prisma.sesion.findMany({ where: { sujetoId: { in: sujetos } }, select: { id: true } });
    await prisma.refreshTokenUsado.deleteMany({ where: { sesionId: { in: sesiones.map((s) => s.id) } } });
    await prisma.sesion.deleteMany({ where: { sujetoId: { in: sujetos } } });
    await prisma.exportacion.deleteMany({ where: { perfilId: { in: idsPerfiles } } });
    await prisma.aula.deleteMany({ where: { docenteId: { in: idsCuentas } } });
    await prisma.cuenta.deleteMany({ where: { id: { in: idsCuentas } } });
  } finally {
    await prisma.$disconnect();
  }
}
