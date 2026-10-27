import { expect, Page } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../support/diagnostico';
import { docenteConAula } from '../support/escuela';
import {
  acompanarDesdeElAula,
  domingoALas1830,
  ejecutarReportes,
  enlaceDeBaja,
  familiaConConsentimiento,
  hijoDeFamilia,
  resumenesDe,
} from '../support/familia';
import { ingresarComoAdulto, ipSimulada } from '../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../support/lectura';
import { refrescarVistas, sembrarMaestria } from '../support/seguimiento';
import { Cuando, Dado, Entonces, Mundo } from './fixtures';

/** Nivel 4 — Pasos de los escenarios del acompañamiento familiar (RF-068 a RF-071, RN-17). */

const familia = (mundo: Mundo) => mundo.familia!;
const casillaResumen = (page: Page) => page.getByRole('checkbox', { name: 'Recibir el resumen semanal' });
const tarjetaDe = (page: Page, alias: string) => page.locator('article').filter({ has: page.getByRole('heading', { name: alias }) });

async function entrar(page: Page, mundo: Mundo) {
  await ingresarComoAdulto(page, familia(mundo).email, familia(mundo).contrasena);
  await expect(page.getByRole('heading', { level: 1, name: /^Hola/ })).toBeVisible();
}

// ── Preparación ──────────────────────────────────────────────────────────────

Dado('una familia que acompaña a Mateo, que esta semana terminó una lectura y tiene inferencias por reforzar', async ({ request, mundo }) => {
  const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, aula, 'Mateo', ['LIT', 'VOC']);
  const killa = await lecturaKilla(request);
  await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { nino: await sesionDelNino(request, aula, 'Mateo'), terminar: true, fallar: [ENUNCIADOS.seleccion] });
  await sembrarMaestria(aula.estudiantes['Mateo'] as string, { INF: 30, LIT: 80, VOC: 80 });
  const f = await familiaConConsentimiento(request, 'uat-familia');
  await acompanarDesdeElAula(request, aula, 'Mateo', f);
  mundo.familia = { ...f, hijos: { Mateo: aula.estudiantes['Mateo'] as string } };
  await refrescarVistas();
});

Dado('dos familias, cada una con su hija', async ({ request, mundo }) => {
  const f = await familiaConConsentimiento(request, 'uat-familia-a');
  const otra = await familiaConConsentimiento(request, 'uat-familia-b');
  mundo.familia = { ...f, hijos: { Lucía: await hijoDeFamilia(request, f, 'Lucía'), Ajena: await hijoDeFamilia(request, otra, 'Valentina') } };
});

Dado('una familia con su hija Lucía', async ({ request, mundo }) => {
  const f = await familiaConConsentimiento(request, 'uat-familia');
  mundo.familia = { ...f, hijos: { Lucía: await hijoDeFamilia(request, f, 'Lucía') } };
});

Dado('una familia con {int} perfiles de hijos', async ({ request, mundo }, n: number) => {
  const f = await familiaConConsentimiento(request, 'uat-familia');
  const hijos: Record<string, string> = {};
  for (const alias of ['Lucía', 'Ana', 'Teo', 'Luis', 'Sara'].slice(0, n)) hijos[alias] = await hijoDeFamilia(request, f, alias);
  mundo.familia = { ...f, hijos };
});

// ── Acciones ─────────────────────────────────────────────────────────────────

Cuando('abre el avance de Mateo', async ({ page, mundo }) => {
  await entrar(page, mundo);
  await page.getByRole('link', { name: 'Ver el avance de Mateo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible();
});

Cuando('una intenta abrir el avance de la hija de la otra', async ({ page, mundo }) => {
  await entrar(page, mundo);
  await page.goto(`/familia/hijos/${familia(mundo).hijos['Ajena']}`);
});

Cuando('llega el domingo a las 18:00', async ({ request }) => {
  await ejecutarReportes(request, domingoALas1830());
});

Cuando('desactiva {string} en su panel', async ({ page, mundo }, casilla: string) => {
  await entrar(page, mundo);
  await page.getByRole('checkbox', { name: casilla }).uncheck();
  await expect(page.getByText('Listo: ya no recibirás el resumen semanal.')).toBeVisible();
});

Cuando('cambia el avatar de Lucía, le restablece el PIN y la desactiva', async ({ page, mundo }) => {
  await entrar(page, mundo);
  const lucia = tarjetaDe(page, 'Lucía');
  await lucia.getByRole('button', { name: 'Editar' }).click();
  await lucia.getByRole('button', { name: 'Tigre', exact: true }).click();
  await lucia.getByRole('button', { name: 'Guardar' }).click();
  await expect(lucia.getByText('Perfil actualizado.')).toBeVisible();
  await lucia.getByRole('button', { name: 'Cambiar PIN' }).click();
  await lucia.getByLabel('Nuevo PIN de 4 números').fill('7391');
  await lucia.getByRole('button', { name: 'Guardar PIN' }).click();
  await expect(lucia.getByText(/^PIN restablecido/)).toBeVisible();
  await lucia.getByRole('button', { name: 'Desactivar' }).click();
  await expect(lucia.getByText('Perfil desactivado.')).toBeVisible();
});

// ── Resultados ───────────────────────────────────────────────────────────────

Entonces('ve cuánto leyó esta semana y en qué mundo va', async ({ page }) => {
  const semana = page.getByRole('list', { name: 'Esta semana' });
  await expect(semana.getByRole('listitem').first()).toContainText('de lectura');
  await expect(semana.getByRole('listitem').filter({ hasText: 'lectura terminada' }).locator('.seg-cifra')).toHaveText('1');
  const mundo = page.getByRole('list', { name: 'Su avance' }).getByRole('listitem').first();
  await expect(mundo.locator('.seg-cifra')).toHaveText('Mundo 2');
  await expect(mundo).toContainText('Detective');
});

Entonces('ve inferencias como habilidad a reforzar con al menos una idea práctica para casa', async ({ page }) => {
  const inferencias = page.getByRole('list', { name: 'Habilidades para reforzar' }).getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Inferencias' }) });
  await expect(inferencias).toContainText('Descubrir lo que no se dice');
  const ideas = inferencias.getByRole('list', { name: 'Ideas para inferencias' }).getByRole('listitem');
  expect(await ideas.count()).toBeGreaterThanOrEqual(1);
  // Para no especialistas: sin siglas ni términos técnicos.
  for (const idea of await ideas.allInnerTexts()) expect(idea).not.toMatch(/\b(INF|CNEB)\b|maestría/i);
});

Entonces('ve {string} y ningún dato de ella', async ({ page }, mensaje: string) => {
  await expect(page.getByText(mensaje)).toBeVisible();
  await expect(page.getByText('Valentina')).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Habilidades', exact: true })).toHaveCount(0);
});

Entonces('recibe por correo el resumen semanal de Lucía con un enlace para darse de baja', async ({ request, mundo }) => {
  const [correo] = await resumenesDe(request, familia(mundo).email);
  expect(correo!.asunto).toBe('Resumen semanal: así leyó Lucía');
  expect(correo!.texto).toContain('Lucía\n• ');
  expect(enlaceDeBaja(correo!.texto)).toMatch(/^\/resumen-familiar\/baja\?token=/);
  // También el botón "Cancelar suscripción" del programa de correo (RFC 8058).
  expect(correo!.bajaUrl).toMatch(/\/api\/v1\/familia\/preferencias-notificacion\/baja\?token=/);
});

Entonces('con un clic en ese enlace, sin iniciar sesión, deja de recibirlo', async ({ browser, baseURL, request, mundo }) => {
  const [correo] = await resumenesDe(request, familia(mundo).email);
  const contexto = await browser.newContext({ baseURL, extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });
  const pagina = await contexto.newPage();
  await pagina.goto(enlaceDeBaja(correo!.texto));
  await expect(pagina.getByRole('heading', { level: 1, name: 'Ya no recibirás el resumen semanal' })).toBeVisible();
  await contexto.close();
});

Entonces('el domingo siguiente ya no le llega', async ({ request, mundo }) => {
  await ejecutarReportes(request, domingoALas1830(1));
  expect(await resumenesDe(request, familia(mundo).email)).toHaveLength(1);
});

Entonces('el domingo no le llega el resumen', async ({ request, mundo }) => {
  await ejecutarReportes(request, domingoALas1830());
  expect(await resumenesDe(request, familia(mundo).email)).toHaveLength(0);
});

Entonces('al activarlo de nuevo, el domingo siguiente sí le llega', async ({ page, request, mundo }) => {
  await casillaResumen(page).check();
  await expect(page.getByText('Listo: recibirás el resumen cada domingo.')).toBeVisible();
  await ejecutarReportes(request, domingoALas1830(1));
  expect(await resumenesDe(request, familia(mundo).email)).toHaveLength(1);
});

Entonces('Lucía aparece con su nuevo avatar y desactivada', async ({ page }) => {
  await page.reload();
  const lucia = tarjetaDe(page, 'Lucía');
  await expect(lucia.getByText('Desactivado', { exact: true })).toBeVisible();
  await lucia.getByRole('button', { name: 'Editar' }).click();
  await expect(lucia.getByRole('button', { name: 'Tigre', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

Entonces('al crear el sexto perfil ya no puede agregar otro', async ({ page }) => {
  await page.reload();
  await page.getByRole('button', { name: '+ Agregar perfil' }).click();
  await page.getByLabel('Alias o apodo').fill('Pía');
  await page.getByLabel('PIN de 4 números').fill('5274');
  await page.getByLabel('Repite el PIN').fill('5274');
  await page.getByRole('button', { name: 'Crear perfil' }).click();
  await expect(page.getByRole('heading', { name: 'Mis hijos (6/6)' })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Agregar perfil' })).toHaveCount(0);
});
