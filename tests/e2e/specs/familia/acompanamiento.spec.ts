import { expect, Page, test as base } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../../support/diagnostico';
import { docenteConAula } from '../../support/escuela';
import {
  acompanarDesdeElAula,
  domingoALas1830,
  ejecutarReportes,
  enlaceDeBaja,
  familiaConConsentimiento,
  hijoDeFamilia,
  resumenesDe,
} from '../../support/familia';
import { ingresarComoAdulto, ipSimulada } from '../../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../../support/lectura';
import { refrescarVistas, sembrarMaestria } from '../../support/seguimiento';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

async function sinDesbordes(page: Page) {
  const desborde = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, document.documentElement.scrollWidth - window.innerWidth));
  expect(desborde, 'la página no debe desplazarse hacia los lados').toBeLessThanOrEqual(0);
}

/**
 * Nivel 3 — Acompañamiento familiar de punta a punta (RF-068 a RF-071) en escritorio, tablet y celular:
 * la familia abre el avance de su hijo (su semana, su mundo, sus habilidades y cómo acompañarlo en casa),
 * decide si recibe el resumen semanal y se da de baja con un clic desde el correo; y gestiona los perfiles
 * de sus hijos (avatar, PIN, desactivar, hasta 6).
 */
test.describe('Acompañamiento familiar (RF-068 a RF-071)', () => {
  test.setTimeout(150_000);

  test('RF-068, RF-069: el avance de su hijo y cómo acompañarlo en casa', async ({ page, request }) => {
    // Mateo lee de verdad en su aula; la familia lo acompaña por invitación de su docente.
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await retoTerminado(request, aula, 'Mateo', ['LIT', 'VOC']);
    const killa = await lecturaKilla(request);
    await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { nino: await sesionDelNino(request, aula, 'Mateo'), terminar: true, fallar: [ENUNCIADOS.seleccion] });
    await sembrarMaestria(aula.estudiantes['Mateo'] as string, { INF: 30, LIT: 80, VOC: 80 });
    const familia = await familiaConConsentimiento(request, 'familia-avance');
    await acompanarDesdeElAula(request, aula, 'Mateo', familia);
    await refrescarVistas();

    await ingresarComoAdulto(page, familia.email, familia.contrasena);
    await page.getByRole('link', { name: 'Ver el avance de Mateo' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible();
    await expect(page.getByText('Desde su aula')).toBeVisible();

    // RF-068: cuánto leyó esta semana, su avance y sus habilidades.
    const semana = page.getByRole('list', { name: 'Esta semana' });
    await expect(semana.getByRole('listitem').filter({ hasText: 'lectura terminada' }).locator('.seg-cifra')).toHaveText('1');
    const mundo = page.getByRole('list', { name: 'Su avance' }).getByRole('listitem').first();
    await expect(mundo.locator('.seg-cifra')).toHaveText('Mundo 2');
    await expect(mundo).toContainText('Detective');
    await expect(page.getByRole('list', { name: 'Habilidades', exact: true }).getByRole('listitem')).toHaveCount(5);
    await expect(page.getByRole('progressbar', { name: 'Inferencias: En inicio (30)' })).toBeVisible();

    // RF-069: inferencias para reforzar, con ideas prácticas para casa y una lectura que aún no leyó.
    const reforzar = page.getByRole('list', { name: 'Habilidades para reforzar' }).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Inferencias' }) });
    await expect(reforzar.getByRole('list', { name: 'Ideas para inferencias' }).getByRole('listitem')).toHaveCount(2);
    await expect(reforzar.getByText(/^Lectura sugerida: «.+»/)).toBeVisible();
    await expect(reforzar).not.toContainText(`«${killa.titulo}»`);
    await expect(page.getByRole('list', { name: 'Ideas para el hábito' }).getByRole('listitem')).toHaveCount(3);
    await sinDesbordes(page);

    // Vuelve a "Mis hijos".
    await page.getByRole('link', { name: 'Mis hijos' }).first().click();
    await expect(page.getByRole('heading', { name: 'Desde su aula (1)' })).toBeVisible();
  });

  test('RF-070: decide si recibe el resumen del domingo y se da de baja con un clic desde el correo', async ({ page, request, browser, baseURL }) => {
    const familia = await familiaConConsentimiento(request, 'familia-resumen');
    await hijoDeFamilia(request, familia, 'Lucía');
    await ingresarComoAdulto(page, familia.email, familia.contrasena);

    // Desde su panel: desactivar y volver a activar.
    const casilla = page.getByRole('checkbox', { name: 'Recibir el resumen semanal' });
    await expect(casilla).toBeChecked();
    await casilla.uncheck();
    await expect(page.getByText('Listo: ya no recibirás el resumen semanal.')).toBeVisible();
    await page.reload();
    await expect(casilla).not.toBeChecked();
    await casilla.check();
    await expect(page.getByText('Listo: recibirás el resumen cada domingo.')).toBeVisible();

    // El domingo a las 18:00 le llega, con el enlace de baja.
    await ejecutarReportes(request, domingoALas1830());
    const [correo] = await resumenesDe(request, familia.email);
    expect(correo!.asunto).toBe('Resumen semanal: así leyó Lucía');
    expect(correo!.texto).toContain('Lucía\n• Esta semana no leyó en LectoAventura.');

    // Un clic en el enlace basta, sin iniciar sesión; y se puede deshacer.
    const otra = await browser.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });
    const pagina = await otra.newPage();
    await pagina.goto(enlaceDeBaja(correo!.texto));
    await expect(pagina.getByRole('heading', { level: 1, name: 'Ya no recibirás el resumen semanal' })).toBeVisible();
    await sinDesbordes(pagina);
    await pagina.getByRole('button', { name: 'Me equivoqué: quiero seguir recibiéndolo' }).click();
    await expect(pagina.getByRole('heading', { level: 1, name: 'Volverás a recibir el resumen semanal' })).toBeVisible();
    await pagina.goto(enlaceDeBaja(correo!.texto));
    await expect(pagina.getByRole('heading', { level: 1, name: 'Ya no recibirás el resumen semanal' })).toBeVisible();
    await otra.close();

    // Dada de baja, el domingo siguiente no le llega; y su panel lo muestra.
    await ejecutarReportes(request, domingoALas1830(1));
    expect(await resumenesDe(request, familia.email)).toHaveLength(1);
    await page.reload();
    await expect(casilla).not.toBeChecked();
  });

  test('RF-071: gestiona los perfiles de sus hijos — avatar, PIN, desactivar — hasta 6', async ({ page, request }) => {
    const familia = await familiaConConsentimiento(request, 'familia-perfiles');
    for (const alias of ['Lucía', 'Ana', 'Teo', 'Luis', 'Sara']) await hijoDeFamilia(request, familia, alias);
    await ingresarComoAdulto(page, familia.email, familia.contrasena);
    await expect(page.getByRole('heading', { name: 'Mis hijos (5/6)' })).toBeVisible();

    const lucia = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Lucía' }) });
    await lucia.getByRole('button', { name: 'Editar' }).click();
    await lucia.getByRole('button', { name: 'Tigre', exact: true }).click();
    await lucia.getByRole('button', { name: 'Guardar' }).click();
    await expect(lucia.getByText('Perfil actualizado.')).toBeVisible();

    await lucia.getByRole('button', { name: 'Cambiar PIN' }).click();
    await lucia.getByLabel('Nuevo PIN de 4 números').fill('7391');
    await lucia.getByRole('button', { name: 'Guardar PIN' }).click();
    await expect(lucia.getByText(/^PIN restablecido/)).toBeVisible();

    await lucia.getByRole('button', { name: 'Desactivar' }).click();
    await expect(lucia.getByText('Desactivado', { exact: true })).toBeVisible();
    await expect(lucia.getByRole('button', { name: 'Activar' })).toBeVisible();

    // El sexto perfil llena la cuenta: ya no se puede agregar otro.
    await page.getByRole('button', { name: '+ Agregar perfil' }).click();
    await page.getByLabel('Alias o apodo').fill('Pía');
    await page.getByLabel('PIN de 4 números').fill('5274');
    await page.getByLabel('Repite el PIN').fill('5274');
    await page.getByRole('button', { name: 'Crear perfil' }).click();
    await expect(page.getByRole('heading', { name: 'Mis hijos (6/6)' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Agregar perfil' })).toHaveCount(0);
    const septimo = await request.post('/api/v1/estudiantes', {
      headers: familia.headers,
      data: { alias: 'Uno más', anioNacimiento: new Date().getFullYear() - 9, mesNacimiento: 3, avatar: 'zorro', pin: '5274' },
    });
    expect(septimo.status()).toBe(409);
    await sinDesbordes(page);
  });
});
