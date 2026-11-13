import { expect, Page, test } from '@playwright/test';

import { correoUnico, cuentaVerificada, ingresarComoAdulto, ipSimulada, salirDelPanel } from '../../support/iam';

test.use({ extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });

/**
 * Nivel 3 — Ingreso con Google para docentes y familias, de punta a punta en el navegador, con el "Google de prueba"
 * (la API lo ofrece fuera de producción y sin credenciales). Los correos son del dominio de E2E: la limpieza los borra.
 */
async function elegirCuentaDeGoogle(page: Page, email: string, nombre?: string) {
  await expect(page.getByRole('heading', { name: 'Google de prueba' })).toBeVisible();
  await page.getByLabel('Correo de Google').fill(email);
  if (nombre) await page.getByLabel('Nombre').fill(nombre);
  await page.getByRole('button', { name: 'Continuar' }).click();
}

test.describe('[Iam][Core][Slow] Ingreso con Google (docentes y familias)', () => {
  test.beforeEach(async ({ request }) => {
    const r = await request.get('/api/v1/auth/google/disponible');
    test.skip(!(await r.json()).simulado, 'Con credenciales reales de Google configuradas, esta prueba no aplica.');
  });

  test('una familia se registra con Google y vuelve a entrar con un clic', async ({ page }) => {
    const email = correoUnico('google');
    await page.goto('/registro');
    await page.getByRole('button', { name: /Familiar/ }).click();
    await page.getByRole('link', { name: 'Registrarme con Google' }).click();
    await elegirCuentaDeGoogle(page, email, 'Carmen Quispe');
    // Google ya confirmó el correo: la cuenta queda lista y entra a su panel sin pasos extra.
    await expect(page).toHaveURL(/\/familia$/);
    await expect(page.getByRole('heading', { name: /Hola, Carmen/ })).toBeVisible();

    await salirDelPanel(page);
    await page.goto('/ingresar');
    await page.getByRole('link', { name: 'Continuar con Google' }).click();
    await elegirCuentaDeGoogle(page, email);
    await expect(page).toHaveURL(/\/familia$/);
  });

  test('una docente con contraseña vincula su cuenta de Google desde su panel y luego entra con ella', async ({ page, request }) => {
    const docente = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Rosa Docente', prefijo: 'docente' });
    const googlePersonal = correoUnico('google-personal');
    await ingresarComoAdulto(page, docente.email, docente.contrasena);
    await expect(page).toHaveURL(/\/docente$/);
    await page.getByRole('button', { name: 'Vincular con Google' }).click();
    await elegirCuentaDeGoogle(page, googlePersonal);
    await expect(page).toHaveURL(/\/docente\?google=vinculada$/);
    await expect(page.getByText('¡Listo! Tu cuenta quedó vinculada con Google')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Desvincular Google' })).toBeVisible();

    await salirDelPanel(page);
    await page.goto('/ingresar');
    await page.getByRole('link', { name: 'Continuar con Google' }).click();
    await elegirCuentaDeGoogle(page, googlePersonal);
    await expect(page).toHaveURL(/\/docente$/);
  });

  test('sin cuenta, le explica cómo registrarse; y el registro con correo sigue igual que siempre', async ({ page }) => {
    await page.goto('/ingresar');
    await page.getByRole('link', { name: 'Continuar con Google' }).click();
    await elegirCuentaDeGoogle(page, correoUnico('sin-cuenta'));
    await expect(page).toHaveURL(/\/ingresar\?google=sin-cuenta$/);
    await expect(page.getByText('No encontramos una cuenta con ese correo de Google')).toBeVisible();
    // El ingreso con correo y contraseña sigue en su lugar.
    await expect(page.getByLabel('Correo electrónico')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
  });
});
