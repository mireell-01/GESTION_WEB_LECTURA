import { ConsoleLogger, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../../../src/app.module';
import { configurarApp } from '../../../src/configurar-app';
import { PrismaService } from '../../../src/modules/shared-kernel/public-api';

export interface AppDePrueba {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
  cerrar: () => Promise<void>;
}

/**
 * Arranca la API completa (todos los módulos) con la misma configuración que producción.
 * `conLogs`: usa el logger real de NestJS (el de pruebas solo imprime errores), para verificar RNF-031.
 */
export async function crearApp(opciones: { conLogs?: boolean } = {}): Promise<AppDePrueba> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configurarApp(
    modulo.createNestApplication(opciones.conLogs ? { logger: new ConsoleLogger() } : undefined),
  );
  await app.init();
  const prisma = app.get(PrismaService);
  return {
    app,
    prisma,
    http: () => request(app.getHttpServer()),
    cerrar: () => app.close(),
  };
}

/** Schemas de los bounded contexts (SRS §7). */
const SCHEMAS = ['iam', 'escuela', 'contenido', 'aventura', 'diagnostico', 'lectura', 'progreso', 'gamificacion', 'asistente', 'admin'];
/** Datos de catálogo que cargan las migraciones (los 5 mundos, el banco del diagnóstico, los parámetros, insignias y recompensas de gamificación). */
const CATALOGO = ['aventura.mundo', 'diagnostico.banco_item_diagnostico', 'gamificacion.parametro_gamificacion', 'gamificacion.insignia', 'gamificacion.recompensa'];

/** Deja vacías todas las tablas de los módulos, salvo el catálogo y el historial de migraciones. */
export async function vaciarBase(prisma: PrismaService): Promise<void> {
  const tablas = await prisma.$queryRaw<{ schemaname: string; tablename: string }[]>`
    SELECT schemaname, tablename FROM pg_tables WHERE schemaname = ANY(${SCHEMAS})`;
  const aVaciar = tablas.filter((t) => !CATALOGO.includes(`${t.schemaname}.${t.tablename}`));
  if (aVaciar.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${aVaciar.map((t) => `"${t.schemaname}"."${t.tablename}"`).join(', ')}`);
  }
}

/** Valor de la cookie `la_refresh` de una respuesta (o undefined). */
export function cookieRefresh(res: { headers: Record<string, unknown> }): string | undefined {
  const cabeceras = (res.headers['set-cookie'] as string[] | undefined) ?? [];
  return cabeceras.find((c) => c.startsWith('la_refresh='));
}
