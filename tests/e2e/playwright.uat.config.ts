import { defineConfig } from '@playwright/test';
import { cucumberReporter, defineBddConfig } from 'playwright-bdd';

import { servidores, WEB } from './support/servidores';

/**
 * Nivel 4 — Pruebas de aceptación (UAT/BDD): escenarios Gherkin en español ejecutados con
 * playwright-bdd sobre la aplicación real. Genera un informe legible para el Product Owner.
 */
const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: ['steps/**/*.ts'],
  language: 'es',
  outputDir: '.features-gen',
});

const canal = process.env.PW_CANAL ?? 'msedge';

export default defineConfig({
  testDir,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    cucumberReporter('html', { outputFile: 'reportes/uat/informe-uat.html' }),
    cucumberReporter('junit', { outputFile: 'reportes/uat/junit.xml' }),
  ],
  globalTeardown: './support/limpieza.ts',
  use: {
    baseURL: WEB,
    locale: 'es-PE',
    timezoneId: 'America/Lima',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(canal === 'chromium' ? {} : { channel: canal }),
    // UAT en el dispositivo principal del SRS: tablet táctil (RNF-022).
    viewport: { width: 820, height: 1180 },
    hasTouch: true,
  },
  webServer: servidores,
});
