import { createBdd, test as base } from 'playwright-bdd';

import { ipSimulada } from '../support/iam';

/** Estado compartido entre los pasos de un mismo escenario. */
export interface Mundo {
  email?: string;
  contrasena?: string;
  /** Tarjeta de acceso de la estudiante de un aula (CR-01). */
  tarjeta?: { docente: { email: string; contrasena: string }; aula: string; alias: string; pin: string };
}

/**
 * Nivel 4 — Fixtures de UAT:
 * - cada escenario es un dispositivo distinto (IP simulada) para que el límite de tasa por IP
 *   (RNF-019) no mezcle escenarios;
 * - los escenarios con @reloj controlan el reloj de la página para probar tiempos (RF-010)
 *   sin esperar minutos reales.
 */
export const test = base.extend<{ mundo: Mundo }>({
  mundo: async ({}, use) => {
    await use({});
  },
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
  page: async ({ page, $tags }, use) => {
    if ($tags.includes('@reloj')) {
      await page.clock.install();
    }
    await use(page);
  },
});

export const { Given: Dado, When: Cuando, Then: Entonces } = createBdd(test);
