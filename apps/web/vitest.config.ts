import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Nivel 1 de la web: la lógica de los componentes y su HTML, sin navegador (renderToStaticMarkup de
 * react-dom/server, ya instalado). Lo que depende del navegador lo cubre el Nivel 3 con Playwright.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['test/**/*.spec.{ts,tsx}'],
    environment: 'node',
  },
});
