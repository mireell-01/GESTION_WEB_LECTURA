import { expect, Page, test } from '@playwright/test';

import { cuentaVerificada, escribirPin, esperarAreaEstudiante, ipSimulada } from '../../support/iam';

test.use({ extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });

/**
 * Nivel 3 — Diseño responsivo (RNF-022, RNF-023). Se ejecuta en los tres proyectos
 * (escritorio 1280 px, tablet 820 px y celular 390 px): sin desplazamiento lateral y con
 * todo lo que se toca de al menos 48 × 48 px.
 */
async function revisarPantalla(page: Page): Promise<void> {
  const resultado = await page.evaluate(() => {
    const visibles = [...document.querySelectorAll<HTMLElement>('button, a, input:not([type="checkbox"]), select')].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    });
    return {
      desborde: document.documentElement.scrollWidth - window.innerWidth,
      pequenos: visibles
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return Math.round(r.height) < 48 || Math.round(r.width) < 48;
        })
        .map((e) => `${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30)} (${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)})`),
    };
  });
  expect(resultado.desborde, 'la página no debe desplazarse hacia los lados').toBeLessThanOrEqual(0);
  expect(resultado.pequenos, 'objetivos táctiles menores de 48 px').toEqual([]);
}

test.describe('Diseño responsivo (RNF-022, RNF-023)', () => {
  for (const ruta of ['/', '/ingresar', '/registro', '/recuperar', '/ingresar/estudiante']) {
    test(`${ruta} se adapta sin desbordes y con objetivos táctiles grandes`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await revisarPantalla(page);
    });
  }

  test('el área del estudiante usa la navegación de cada dispositivo', async ({ page, request }, info) => {
    // Familia con un perfil y la tablet vinculada, preparada por la API (RF-005, RF-006, RN-04).
    const { email, contrasena } = await cuentaVerificada(request, { prefijo: 'diseno' });
    const login = await request.post('/api/v1/auth/login', { data: { email, contrasena } });
    const auth = { Authorization: `Bearer ${(await login.json()).accessToken}` };
    await request.post('/api/v1/consentimientos', { headers: auth, data: { otorganteNombre: 'Rosa Prueba', aceptaPolitica: true } });
    const perfil = await request.post('/api/v1/estudiantes', {
      headers: auth,
      data: { alias: 'Mateo', anioNacimiento: 2018, mesNacimiento: 5, avatar: 'zorro', pin: '2580' },
    });
    expect(perfil.status(), await perfil.text()).toBe(201);
    const { tokenDispositivo } = await (await request.post('/api/v1/familia/dispositivos', { headers: auth, data: { nombre: 'Tablet' } })).json();
    await page.addInitScript((token) => localStorage.setItem('lectoaventura.dispositivo', token), tokenDispositivo);

    // Con la tablet vinculada, la app se abre directo en los avatares (CR-01).
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '¿Quién va a leer hoy?' })).toBeVisible();
    await revisarPantalla(page);
    await page.getByRole('button', { name: 'Mateo' }).click();
    await revisarPantalla(page);
    await escribirPin(page, '2580');
    await esperarAreaEstudiante(page, 'Mateo');
    await revisarPantalla(page);

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    const caja = (await nav.boundingBox())!;
    const ventana = page.viewportSize()!;
    if (info.project.name === 'escritorio') {
      // Computadora: barra lateral a la izquierda, de alto completo, con el letrero.
      expect(caja.x).toBe(0);
      expect(caja.height).toBeGreaterThanOrEqual(ventana.height - 1);
    } else {
      // Tablet vertical y celular: barra inferior al alcance del pulgar.
      expect(Math.round(caja.y + caja.height)).toBeGreaterThanOrEqual(ventana.height - 1);
      expect(caja.width).toBeGreaterThanOrEqual(ventana.width - 1);
    }
    // Las secciones futuras se muestran con candado y avisan "muy pronto".
    await nav.getByRole('button', { name: /Mundos/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Mundos llegará muy pronto' })).toBeVisible();
    // Un solo botón "Salir" visible en cada diseño.
    await expect(page.getByRole('button', { name: 'Salir' })).toHaveCount(1);
  });
});
