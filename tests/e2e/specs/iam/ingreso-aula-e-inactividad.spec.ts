import { expect, test } from '@playwright/test';

import {
  aulaConEstudiante,
  cuentaVerificada,
  escribirPin,
  esperarAreaEstudiante,
  ingresarComoAdulto,
  ipSimulada,
  prepararFamilia,
  URL_AREA_ESTUDIANTE,
} from '../../support/iam';

test.use({ extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });

/** Nivel 3 — Ingreso con código de aula (RF-007, RN-04) y cierre por inactividad (RF-010, R-02). */
test.describe('IAM — aula e inactividad', () => {
  test('el estudiante entra con el código de su aula, su avatar y el PIN de su tarjeta', async ({ page, request }) => {
    const tarjeta = await aulaConEstudiante(request, { alias: 'Sofía', avatar: 'buho' });

    await page.goto('/ingresar/estudiante');
    await page.getByLabel('Código de tu aula').fill('ZZZZZZ');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /No encontramos un aula con ese código/ })).toBeVisible();

    await page.getByLabel('Código de tu aula').fill(tarjeta.codigoAula.toLowerCase());
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Aula: 3.° B' })).toBeVisible();
    await page.getByRole('button', { name: 'Sofía' }).click();
    await escribirPin(page, tarjeta.pin);
    await esperarAreaEstudiante(page, 'Sofía');
  });

  test('si nadie toca la tablet por 10 minutos, la sesión del niño se cierra sola', async ({ page, request }) => {
    await page.clock.install();
    const { email, contrasena } = await cuentaVerificada(request);
    await ingresarComoAdulto(page, email, contrasena);
    await prepararFamilia(page, { alias: 'Nico', avatar: 'Koala', pin: '3691' });
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.goto('/ingresar/estudiante');
    await page.getByRole('button', { name: 'Nico' }).click();
    await escribirPin(page, '3691');
    await esperarAreaEstudiante(page, 'Nico');

    // 9 minutos sin actividad: sigue dentro.
    await page.clock.fastForward('09:00');
    await expect(page).toHaveURL(URL_AREA_ESTUDIANTE);
    // Al pasar los 10 minutos vuelve al ingreso y se le explica por qué.
    await page.clock.fastForward('01:10');
    await expect(page).toHaveURL(/\/ingresar\/estudiante\?motivo=inactividad$/);
    await expect(page.getByText(/no hubo actividad por un rato/)).toBeVisible();
  });
});
