import { expect } from '@playwright/test';

import {
  abrirAula,
  diaLima,
  docenteConAula,
  PIN_PRUEBA,
  pinesDeLaDescarga,
  sembrarCatalogoE2E,
  tabletDelAulaActivada,
} from '../support/escuela';
import { cuentaVerificada, escribirPin, esperarAreaEstudiante, ingresarComoAdulto, salirDelPanel } from '../support/iam';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos (Step Definitions) de los escenarios del modo escuela en español. */

// ── Aula y matrícula (RF-014, RF-015, RF-016) ─────────────────────────────

Dado('que soy una docente con mi cuenta verificada', async ({ page, request, mundo }) => {
  const docente = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Rosa Docente', prefijo: 'uat-docente' });
  mundo.email = docente.email;
  mundo.contrasena = docente.contrasena;
  await ingresarComoAdulto(page, docente.email, docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
});

Cuando('creo el aula {string} declarando el consentimiento de la institución', async ({ page }, aula: string) => {
  await page.getByRole('button', { name: '+ Nueva aula' }).click();
  await page.getByLabel('Nombre del aula').fill(aula);
  await page.getByLabel('Institución educativa').fill('IE 1234 Santa Rosa');
  await page.getByLabel('Autoridad que firmó el consentimiento').fill('Directora Ruiz');
  await page.getByRole('checkbox', { name: /Declaro que la institución/ }).check();
  await page.getByRole('button', { name: 'Crear aula' }).click();
  await expect(page.getByRole('heading', { level: 1, name: aula })).toBeVisible();
});

Cuando('matriculo a {string} con el avatar {string}', async ({ page }, alias: string, avatar: string) => {
  await page.getByRole('button', { name: 'Uno por uno' }).click();
  await page.getByLabel('Alias del estudiante').fill(alias);
  await page.getByRole('button', { name: avatar, exact: true }).click();
  await page.getByRole('button', { name: 'Matricular', exact: true }).click();
  await expect(page.getByText(new RegExp(`Matriculados: ${alias}`))).toBeVisible();
});

Cuando('matriculo con un archivo CSV a {string} y una fila con el mes 13', async ({ page }, alias: string) => {
  await page.getByRole('button', { name: 'Varios con CSV' }).click();
  await page.getByLabel('Contenido del CSV').fill(`alias,año,mes,avatar\n${alias},2017,3,buho\nRita,2017,13,panda`);
  await page.getByRole('button', { name: 'Matricular desde el CSV' }).click();
});

Entonces('veo a {string} y a {string} en la lista de estudiantes', async ({ page }, a: string, b: string) => {
  const lista = page.getByRole('heading', { name: /Estudiantes \(2\/45\)/ });
  await expect(lista).toBeVisible();
  for (const alias of [a, b]) {
    await expect(page.getByRole('button', { name: `Retirar a ${alias} del aula` })).toBeVisible();
  }
});

Entonces('la fila con el mes 13 aparece rechazada con el motivo {string}', async ({ page }, motivo: string) => {
  const fila = page.getByRole('row').filter({ hasText: 'Rita,2017,13,panda' });
  await expect(fila.getByRole('cell', { name: motivo })).toBeVisible();
});

// ── Tarjetas de acceso (RF-017, CR-01) ────────────────────────────────────

Dado('que soy una docente con el aula {string} y la estudiante {string}', async ({ request, mundo }, aula: string, alias: string) => {
  mundo.aula = await docenteConAula(request, [{ alias, avatar: 'zorro' }], aula);
});

Cuando('descargo las tarjetas de acceso de mis estudiantes', async ({ page, mundo }) => {
  await abrirAula(page, mundo.aula!);
  await page.getByRole('checkbox', { name: 'Elegir a todos' }).check();
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Descargar tarjetas \(1\)/ }).click()]);
  expect(descarga.suggestedFilename()).toMatch(/^tarjetas-.*\.pdf$/);
  mundo.pines = await pinesDeLaDescarga(descarga);
});

Entonces('la tarjeta de {string} trae su PIN y ningún código de aula', async ({ page, mundo }, alias: string) => {
  // El aula tiene un solo estudiante: su tarjeta es la única de la hoja.
  expect(Object.keys(mundo.aula!.estudiantes)).toEqual([alias]);
  expect(mundo.pines).toHaveLength(1);
  expect(mundo.pines![0]).toMatch(/^\d{4}$/);
  // El PIN solo existe en la tarjeta impresa: nunca en pantalla.
  await expect(page.getByText(mundo.pines![0] as string, { exact: true })).toHaveCount(0);
});

Entonces('con la tablet del aula activada, {string} entra con el PIN de su tarjeta', async ({ page, request, mundo }, alias: string) => {
  await salirDelPanel(page);
  await tabletDelAulaActivada(page, request, mundo.aula!);
  await page.goto('/');
  await page.getByRole('button', { name: alias }).click();
  await escribirPin(page, mundo.pines![0] as string);
  await esperarAreaEstudiante(page, alias);
});

// ── Asignaciones (RF-018) ─────────────────────────────────────────────────

Dado('que hay una lectura publicada en la biblioteca', async ({ mundo }) => {
  mundo.lectura = (await sembrarCatalogoE2E()).lectura;
});

Cuando('asigno esa lectura a toda el aula con fecha límite dentro de una semana', async ({ page, mundo }) => {
  await abrirAula(page, mundo.aula!);
  await page.getByRole('button', { name: '+ Nueva asignación' }).click();
  await page.getByLabel('Lectura', { exact: true }).selectOption({ label: `${mundo.lectura} — 8–9 años · nivel 2` });
  await page.getByLabel('Fecha límite').fill(diaLima(7));
  await page.getByRole('button', { name: 'Asignar', exact: true }).click();
});

Entonces('la asignación aparece {string} en mi aula', async ({ page, mundo }, estado: string) => {
  await expect(page.getByRole('listitem').filter({ hasText: mundo.lectura }).getByText(estado)).toBeVisible();
});

Entonces('{string} la ve en su inicio como {string}', async ({ page, request, mundo }, alias: string, sello: string) => {
  await salirDelPanel(page);
  await tabletDelAulaActivada(page, request, mundo.aula!);
  await page.goto('/');
  await page.getByRole('button', { name: alias }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, alias);
  const misiones = page.getByRole('region', { name: 'Misiones de tu profe' });
  await expect(misiones.getByText(sello)).toBeVisible();
  await expect(misiones.getByText(mundo.lectura!)).toBeVisible();
});

// ── Invitación familiar (RF-019) ──────────────────────────────────────────

Cuando('genero un código de invitación para la familia de {string}', async ({ page, mundo }, alias: string) => {
  await abrirAula(page, mundo.aula!);
  await page.getByRole('button', { name: `Invitar a la familia de ${alias}` }).click();
  const caja = page.getByRole('region', { name: `Código de invitación para la familia de ${alias}` });
  mundo.codigo = (await caja.locator('.invitacion__codigo').innerText()).trim();
  expect(mundo.codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  await salirDelPanel(page);
});

Cuando('su familia escribe ese código en su panel', async ({ page, request, mundo }) => {
  const familia = await cuentaVerificada(request, { prefijo: 'uat-familia', nombre: 'Carmen Familia' });
  await ingresarComoAdulto(page, familia.email, familia.contrasena);
  await expect(page).toHaveURL(/\/familia$/);
  await page.getByLabel('Código de la docente').fill(mundo.codigo!);
  await page.getByRole('button', { name: 'Usar el código' }).click();
});

Entonces('la familia ve a {string} en {string}', async ({ page }, alias: string, seccion: string) => {
  await expect(page.getByText(`¡Listo! Ahora acompañas a ${alias}`)).toBeVisible();
  const tarjeta = page.getByRole('heading', { name: new RegExp(seccion) }).locator('xpath=ancestor::section[1]');
  await expect(tarjeta.getByRole('heading', { name: alias })).toBeVisible();
});

Entonces('el mismo código ya no sirve para otra familia', async ({ page, request, mundo }) => {
  await salirDelPanel(page);
  const otra = await cuentaVerificada(request, { prefijo: 'uat-otra', nombre: 'Otra Familia' });
  await ingresarComoAdulto(page, otra.email, otra.contrasena);
  await page.getByLabel('Código de la docente').fill(mundo.codigo!);
  await page.getByRole('button', { name: 'Usar el código' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'El código no es válido o ya venció' })).toBeVisible();
});

// ── Archivar (RF-020) ─────────────────────────────────────────────────────

Cuando('archivo el aula {string}', async ({ page, mundo }, aula: string) => {
  await abrirAula(page, mundo.aula!);
  await page.getByRole('button', { name: 'Archivar aula' }).click();
  await page.getByRole('button', { name: `Sí, archivar ${aula}` }).click();
});

Entonces('el aula queda {string} y solo se puede consultar', async ({ page }, estado: string) => {
  await expect(page.getByText('Esta aula está archivada: puedes consultarla, pero ya no se modifica.')).toBeVisible();
  await expect(page.locator('.cabecera-aula').getByText(estado)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Matricular estudiantes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+ Nueva asignación' })).toHaveCount(0);
});
