import { expect, test } from '@playwright/test';

import {
  activarTabletDelAula,
  aulaConEstudiante,
  cuentaVerificada,
  escribirPin,
  esperarAreaEstudiante,
  ingresarComoAdulto,
  ipSimulada,
  prepararFamilia,
  salirDelPanel,
  URL_AREA_ESTUDIANTE,
} from '../../support/iam';

test.use({ extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });

/** Nivel 3 — Tablet del aula sin código (RF-007, RN-04, CR-01) y cierre por inactividad (RF-010, R-02). */
test.describe('IAM — tablet del aula e inactividad', () => {
  test('la docente activa la tablet y el niño entra con su avatar y el PIN de su tarjeta, sin escribir códigos', async ({ page, request }) => {
    const tarjeta = await aulaConEstudiante(request, { alias: 'Sofía', avatar: 'buho' });

    await activarTabletDelAula(page, tarjeta.docente, tarjeta.aula);
    await expect(page.getByText('Aula 3.° B')).toBeVisible();
    await expect(page.getByRole('textbox')).toHaveCount(0);

    await page.getByRole('button', { name: 'Sofía' }).click();
    await expect(page.getByRole('heading', { name: '¡Hola, Sofía!' })).toBeVisible();
    await escribirPin(page, tarjeta.pin);
    await esperarAreaEstudiante(page, 'Sofía');

    // Al salir, la tablet vuelve sola a los avatares del aula para el siguiente niño.
    await page.getByRole('button', { name: 'Salir' }).click();
    await expect(page).toHaveURL(/\/ingresar\/estudiante$/);
    await expect(page.getByRole('button', { name: 'Sofía' })).toBeVisible();
    await page.goto('/');
    await expect(page).toHaveURL(/\/ingresar\/estudiante$/);
  });

  test('si nadie toca la tablet por 10 minutos, la sesión del niño se cierra sola', async ({ page, request }) => {
    await page.clock.install();
    const { email, contrasena } = await cuentaVerificada(request);
    await ingresarComoAdulto(page, email, contrasena);
    await prepararFamilia(page, { alias: 'Nico', avatar: 'Koala', pin: '3691' });
    await salirDelPanel(page);

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
