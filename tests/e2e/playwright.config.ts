import { defineConfig } from '@playwright/test';

/**
 * Nivel 3 — Pruebas de sistema (E2E) con Playwright sobre la web (3002) y la API (3001) reales.
 * En local usa Microsoft Edge instalado (PW_CANAL=msedge); en CI, Chromium descargado (PW_CANAL=chromium).
 */
const WEB = process.env.WEB_URL ?? 'http://localhost:3002';
const canal = process.env.PW_CANAL ?? 'msedge';
const navegador = canal === 'chromium' ? {} : { channel: canal };

export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'reportes/sistema' }], ['junit', { outputFile: 'reportes/sistema/junit.xml' }]]
    : [['list'], ['html', { open: 'never', outputFolder: 'reportes/sistema' }]],
  globalTeardown: './support/limpieza.ts',
  use: {
    baseURL: WEB,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // El video necesita ffmpeg (CI lo instala con `npx playwright install --with-deps`).
    video: process.env.CI ? 'retain-on-failure' : 'off',
  },
  projects: [
    { name: 'escritorio', use: { ...navegador, viewport: { width: 1280, height: 800 } } },
    // RNF-022: diseño tablet-first (768–1180 px) con pantalla táctil.
    { name: 'tablet', use: { ...navegador, viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true } },
  ],
  // En CI se prueba la compilación de producción; en local se reutilizan los servidores de desarrollo.
  webServer: [
    {
      command: process.env.CI
        ? 'npm run build --workspace @lectoaventura/api && npm run start --workspace @lectoaventura/api'
        : 'npm run dev:api',
      cwd: '../..',
      // Responde 401 sin sesión: Playwright lo acepta como "servidor listo".
      url: 'http://localhost:3001/api/iam/yo',
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: process.env.CI
        ? 'npm run build --workspace @lectoaventura/web && npm run start --workspace @lectoaventura/web -- -p 3002'
        : 'npm run dev --workspace @lectoaventura/web -- -p 3002',
      cwd: '../..',
      url: WEB,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
