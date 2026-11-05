import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Suites priorizadas del Nivel 1 (test/suites): por riesgo, por componente y por tiempo. Corren en un
 * archivo aparte de vitest.config.ts para que la ejecución completa y su cobertura no cuenten dos veces
 * cada prueba. Cada barril carga solo sus archivos: filtrar con -t sobre todo el Nivel 1 también selecciona
 * las pruebas, pero igual carga los 39 archivos, y la carga es la mayor parte del tiempo.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/suites/**/*.suite.test.ts'],
    environment: 'node',
  },
});
