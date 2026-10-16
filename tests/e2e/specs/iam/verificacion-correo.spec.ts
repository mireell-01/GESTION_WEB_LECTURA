import { expect, test } from '@playwright/test';

import {
  correoUnico,
  cuentaSinVerificar,
  enlaceDelCorreo,
  ingresarComoAdulto,
  ipSimulada,
  retrocederEnlacesDeVerificacion,
} from '../../support/iam';

test.use({ extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });

const CONFIRMA = /Confirma tu correo/;
const rutaDe = (enlace: string) => new URL(enlace).pathname + new URL(enlace).search;

/** Nivel 3 — Verificación de correo y reenvío del enlace desde la interfaz (RF-002). */
test.describe('IAM — verificación de correo', () => {
  test('si el enlace se perdió, se pide otro desde el ingreso; el anterior deja de servir', async ({ page, request }) => {
    const { email, contrasena } = await cuentaSinVerificar(request);
    const primero = await enlaceDelCorreo(request, email, CONFIRMA);
    await retrocederEnlacesDeVerificacion(email);

    // Con la contraseña correcta, el ingreso explica qué falta y ofrece un enlace nuevo.
    await ingresarComoAdulto(page, email, contrasena);
    await expect(page.getByText('Tu cuenta aún no está verificada.')).toBeVisible();
    await page.getByRole('button', { name: 'Reenviar enlace de verificación' }).click();
    await expect(page.getByText(/te enviamos un enlace nuevo/)).toBeVisible();
    // Tiempo de espera visible antes de poder pedir otro.
    await expect(page.getByRole('button', { name: /Podrás pedir otro enlace en \d+ s/ })).toBeDisabled();

    const nuevo = await enlaceDelCorreo(request, email, CONFIRMA);
    expect(nuevo).not.toBe(primero);

    await page.goto(rutaDe(primero));
    await expect(page.getByRole('heading', { name: 'Este enlace ya no sirve', level: 1 })).toBeVisible();
    await expect(page.getByText(/reemplazado por uno más nuevo/)).toBeVisible();

    await page.goto(rutaDe(nuevo));
    await expect(page.getByRole('heading', { name: /Correo verificado/, level: 1 })).toBeVisible();
    await page.goto(rutaDe(nuevo));
    await expect(page.getByRole('heading', { name: 'Tu correo ya estaba verificado', level: 1 })).toBeVisible();

    await ingresarComoAdulto(page, email, contrasena);
    await expect(page).toHaveURL(/\/familia$/);
  });

  test('un enlace incompleto lo explica y permite pedir otro escribiendo el correo', async ({ page }) => {
    await page.goto('/verificar');
    await expect(page.getByRole('heading', { name: 'No pudimos verificar', level: 1 })).toBeVisible();
    await expect(page.getByText(/El enlace está incompleto/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reenviar enlace de verificación' })).toBeDisabled();
    await page.getByLabel('Tu correo electrónico').fill(correoUnico('nadie'));
    await page.getByRole('button', { name: 'Reenviar enlace de verificación' }).click();
    // Misma respuesta exista o no la cuenta (no revela qué correos están registrados).
    await expect(page.getByText(/Si tu cuenta está pendiente de verificación, te enviamos un enlace nuevo/)).toBeVisible();
  });
});
