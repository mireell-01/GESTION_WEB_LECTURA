import { expect, test } from '@playwright/test';

/** Humo: la portada ofrece las dos puertas de entrada (estudiante y adulto). */
test.describe('Portada', () => {
  test('muestra la marca y los accesos de estudiante y adulto', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'LectoAventura', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: '¡A leer!' })).toHaveAttribute('href', '/ingresar/estudiante');
    await expect(page.getByRole('link', { name: 'Ingresar' })).toHaveAttribute('href', '/ingresar');
    await expect(page.getByRole('link', { name: 'Crear una cuenta' })).toHaveAttribute('href', '/registro');
  });

  test('no hay desplazamiento horizontal (RNF-022)', async ({ page }) => {
    await page.goto('/');
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(desborda).toBe(false);
  });
});
