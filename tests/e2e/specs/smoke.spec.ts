import { expect, test } from '@playwright/test';

/** Humo: la portada abierta ofrece los caminos de adulto (empezar / ya tengo cuenta) y de estudiante. */
test.describe('Portada', () => {
  test('muestra la propuesta y los accesos de adulto y de estudiante', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'La aventura de leer, comprender y crecer', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Empezar' })).toHaveAttribute('href', '/registro');
    await expect(page.getByRole('link', { name: 'Ya tengo una cuenta' })).toHaveAttribute('href', '/ingresar');
    await expect(page.getByRole('link', { name: 'Ingresar', exact: true })).toHaveAttribute('href', '/ingresar');
    await expect(page.getByRole('link', { name: '¡A leer!' })).toHaveAttribute('href', '/ingresar/estudiante');
  });

  test('no hay desplazamiento horizontal (RNF-022)', async ({ page }) => {
    await page.goto('/');
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(desborda).toBe(false);
  });
});
