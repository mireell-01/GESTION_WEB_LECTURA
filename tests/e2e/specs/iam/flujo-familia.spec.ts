import { expect, test } from '@playwright/test';

import {
  CONTRASENA_E2E,
  correoUnico,
  enlaceDelCorreo,
  escribirPin,
  ingresarComoAdulto,
  ipSimulada,
  prepararFamilia,
} from '../../support/iam';

test.use({ extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });

/**
 * Nivel 3 — Recorrido completo de IAM desde la interfaz, como lo haría una familia real:
 * RF-001 → RF-002 → RF-003 → RF-005 → RF-006 → RF-007 → RF-009.
 */
test('una familia se registra, crea el perfil de su hijo y el niño entra con avatar y PIN', async ({ page, request }) => {
  const email = correoUnico('familia');

  // RF-001: registro desde la web.
  await page.goto('/registro');
  await page.getByRole('button', { name: /Familiar/ }).click();
  await page.getByLabel('Nombre y apellido').fill('Rosa Prueba');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(CONTRASENA_E2E);
  await page.getByLabel('Repite la contraseña').fill(CONTRASENA_E2E);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByRole('heading', { name: /Revisa tu correo/ })).toBeVisible();

  // RF-002: el enlace del correo activa la cuenta.
  const enlace = await enlaceDelCorreo(request, email, /Confirma tu correo/);
  await page.goto(new URL(enlace).pathname + new URL(enlace).search);
  await expect(page.getByRole('heading', { name: /Correo verificado/ })).toBeVisible();

  // RF-003 + RF-009: ingreso y aterrizaje en el panel familiar.
  await ingresarComoAdulto(page, email, CONTRASENA_E2E);
  await expect(page.getByRole('heading', { name: /Hola, Rosa/ })).toBeVisible();

  // RF-005, RF-006 y vínculo del dispositivo (RN-04).
  await prepararFamilia(page, { alias: 'Mateo', avatar: 'León', pin: '2580' });
  await expect(page.getByText('8–9 años')).toBeVisible();

  // RF-007: el niño entra con su avatar y su PIN.
  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/ingresar/estudiante');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await expect(page.getByRole('heading', { name: '¡Hola, Mateo!' })).toBeVisible();
  await escribirPin(page, '2580');
  await expect(page).toHaveURL(/\/estudiante$/);
  await expect(page.getByRole('heading', { name: '¡Hola, Mateo!' })).toBeVisible();
});
