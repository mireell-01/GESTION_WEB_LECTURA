import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Nivel 1 — Pruebas unitarias. SWC compila los decoradores de NestJS con metadatos
 * (esbuild, el compilador por defecto de Vitest, no los emite).
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/unit/**/*.spec.ts'],
    environment: 'node',
    reporters: process.env['CI'] ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'reports/unit/junit.xml' },
    coverage: {
      provider: 'v8',
      reportsDirectory: 'reports/unit/coverage',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      include: [
        'src/modules/iam/domain/**',
        'src/modules/iam/application/**',
        'src/modules/iam/infrastructure/crypto/**',
        'src/modules/iam/infrastructure/passwords/**',
        'src/modules/iam/infrastructure/export/**',
        'src/modules/iam/interface/http/guards.ts',
        'src/modules/escuela/domain/**',
        'src/modules/escuela/application/**',
        'src/modules/escuela/infrastructure/pdf/**',
        'src/modules/administracion/domain/entities/auditoria.ts',
        'src/modules/administracion/application/use-cases/registrar-auditoria.use-case.ts',
        'src/modules/shared-kernel/interface/limite-tasa.ts',
        'src/modules/shared-kernel/interface/filtro-errores.ts',
        'src/modules/shared-kernel/infrastructure/redaccion.ts',
      ],
      exclude: ['**/*.dto.ts', '**/ports/**', '**/casos-uso-iam.ts', '**/iam.facade.ts', '**/casos-uso-escuela.ts', '**/escuela.facade.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
