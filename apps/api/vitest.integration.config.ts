import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Nivel 2 — Pruebas de integración: API NestJS completa + PostgreSQL real y efímero.
 * Los archivos se ejecutan en serie porque comparten la misma base de pruebas.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/**/*.int-spec.ts'],
    environment: 'node',
    globalSetup: ['test/integration/setup/global-setup.ts'],
    setupFiles: ['test/integration/setup/entorno.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
    reporters: process.env['CI'] ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'reports/integration/junit.xml' },
  },
});
