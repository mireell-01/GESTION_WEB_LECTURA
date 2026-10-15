import { createBdd, test as base } from 'playwright-bdd';

import { ipSimulada } from '../support/iam';

/** Estado compartido entre los pasos de un mismo escenario. */
export interface Mundo {
  email?: string;
  contrasena?: string;
}

/**
 * Nivel 4 — Fixtures de UAT: cada escenario es un dispositivo distinto (IP simulada propia)
 * para que el límite de tasa por IP (RNF-019) no mezcle escenarios.
 */
export const test = base.extend<{ mundo: Mundo }>({
  mundo: async ({}, use) => {
    await use({});
  },
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

export const { Given: Dado, When: Cuando, Then: Entonces } = createBdd(test);
