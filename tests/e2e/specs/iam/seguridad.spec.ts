import { expect, test } from '@playwright/test';

import { cuentaVerificada, escribirPin, ingresarComoAdulto, ipSimulada, prepararFamilia } from '../../support/iam';

test.use({ extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });

/** Nivel 3 — Casos negativos y de seguridad de IAM vistos desde la interfaz. */
test.describe('IAM — seguridad de acceso', () => {
  test('credenciales incorrectas muestran un error claro y no dejan entrar (RF-003)', async ({ page, request }) => {
    const { email } = await cuentaVerificada(request);
    await ingresarComoAdulto(page, email, 'no-es-la-contraseña');
    await expect(page.getByRole('alert').filter({ hasText: /Correo o contraseña incorrectos/ })).toBeVisible();
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('sin sesión, las áreas protegidas llevan al ingreso correcto (RF-009)', async ({ page }) => {
    await page.goto('/familia');
    await expect(page).toHaveURL(/\/ingresar\?volver=%2Ffamilia/);
    await page.goto('/estudiante');
    await expect(page).toHaveURL(/\/ingresar\/estudiante$/);
  });

  test('sin dispositivo vinculado no se muestran avatares, solo el código de aula (RN-04)', async ({ page }) => {
    await page.goto('/ingresar/estudiante');
    await expect(page.getByRole('heading', { name: /Entra a tu aula/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
  });

  test('PIN incorrecto avisa los intentos restantes; el niño no puede abrir el panel familiar (RF-008, RF-009)', async ({ page, request }) => {
    const { email, contrasena } = await cuentaVerificada(request);
    await ingresarComoAdulto(page, email, contrasena);
    await prepararFamilia(page, { alias: 'Lucía', avatar: 'Zorro', pin: '3691' });
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/ingresar/estudiante');
    await page.getByRole('button', { name: 'Lucía' }).click();
    await escribirPin(page, '9090');
    await expect(page.getByRole('alert').filter({ hasText: /Te quedan 4 intentos/ })).toBeVisible();

    await escribirPin(page, '3691');
    await expect(page).toHaveURL(/\/estudiante$/);
    await page.goto('/familia');
    await expect(page).toHaveURL(/\/estudiante$/);
  });

  test('la sesión sobrevive a recargar y "Salir" la cierra de verdad (RF-003, RF-010)', async ({ page, request }) => {
    const { email, contrasena } = await cuentaVerificada(request);
    await ingresarComoAdulto(page, email, contrasena);
    await expect(page).toHaveURL(/\/familia$/);

    await page.reload();
    await expect(page.getByRole('heading', { name: /Hola, Rosa/ })).toBeVisible();

    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/familia');
    await expect(page).toHaveURL(/\/ingresar/);
  });
});
