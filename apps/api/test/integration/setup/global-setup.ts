import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node';

/**
 * Nivel 2 — Base de datos real y efímera para las pruebas de integración.
 *
 * - USAR_TESTCONTAINERS=1 (CI o equipos con Docker): levanta postgres:16-alpine en un contenedor
 *   desechable con Testcontainers.
 * - Sin Docker: usa la base `lectoaventura_test` del PostgreSQL local (nunca la de desarrollo)
 *   y la recrea desde cero en cada ejecución.
 * En ambos casos aplica todas las migraciones de Prisma antes de las pruebas.
 */
let detener: (() => Promise<unknown>) | undefined;

function urlLocalDePruebas(): string {
  if (process.env['DATABASE_URL_PRUEBAS']) return process.env['DATABASE_URL_PRUEBAS'];
  const env = resolve(__dirname, '../../../.env');
  const linea = existsSync(env)
    ? readFileSync(env, 'utf8').split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='))
    : undefined;
  if (!linea) throw new Error('Define DATABASE_URL_PRUEBAS o DATABASE_URL en apps/api/.env');
  const url = new URL(linea.slice('DATABASE_URL='.length).replace(/^"|"$/g, ''));
  url.pathname = '/lectoaventura_test';
  return url.toString();
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let url: string;
  if (process.env['USAR_TESTCONTAINERS'] === '1') {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const contenedor = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('lectoaventura_test')
      .start();
    url = contenedor.getConnectionUri();
    detener = () => contenedor.stop();
  } else {
    url = urlLocalDePruebas();
    if (!new URL(url).pathname.endsWith('_test')) {
      throw new Error('Por seguridad, la base de pruebas debe terminar en "_test"');
    }
  }

  // Recrea el esquema completo aplicando las migraciones reales del proyecto.
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: resolve(__dirname, '../../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  project.provide('databaseUrl', url);
  return async () => {
    await detener?.();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}
