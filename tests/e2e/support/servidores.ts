import type { PlaywrightTestConfig } from '@playwright/test';

export const WEB = process.env.WEB_URL ?? 'http://localhost:3002';
/** La API a la que la web reenvía /api (la misma API_URL con que se compiló la web). */
const API = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Servidores que necesitan los niveles 3 (E2E) y 4 (UAT). Cada ejecución de Playwright apaga
 * al terminar los servidores que levantó, así que ambas configuraciones deben declararlos.
 * En CI se arranca la compilación de producción (el workflow compila antes una sola vez);
 * en local se reutilizan los servidores de desarrollo si ya están corriendo.
 */
export const servidores: PlaywrightTestConfig['webServer'] = [
  {
    command: process.env.CI ? 'npm run start --workspace @lectoaventura/api' : 'npm run dev:api',
    cwd: '../..',
    // Responde 401 sin sesión: Playwright lo acepta como "servidor listo".
    url: `${API}/api/v1/auth/yo`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  {
    command: process.env.CI
      ? 'npm run start --workspace @lectoaventura/web -- -p 3002'
      : 'npm run dev --workspace @lectoaventura/web -- -p 3002',
    cwd: '../..',
    url: WEB,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
];
