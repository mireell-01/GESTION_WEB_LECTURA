import { expect, Page } from '@playwright/test';

import { idMundo, simularDesbloqueo, tituloMision } from '../support/aventura';
import { cuentaBackoffice, ingresarBackoffice, lecturaPublicada } from '../support/contenido';
import { retoTerminado } from '../support/diagnostico';
import { docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../support/escuela';
import { escribirPin, esperarAreaEstudiante, salirDelPanel } from '../support/iam';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos de los escenarios de Aventura (RF-030 a RF-033). */

const NUMERO: Record<string, number> = { Explorador: 1, Detective: 2, Investigador: 3, Crítico: 4, 'Maestro de la Lectura': 5 };

interface Estado {
  lectura?: string;
  mision?: string;
}
const estado = new WeakMap<object, Estado>();
const de = (mundo: object): Estado => {
  if (!estado.has(mundo)) estado.set(mundo, {});
  return estado.get(mundo) as Estado;
};

const enlaceDelMundo = (page: Page, nombre: string) => page.getByRole('link', { name: `Entrar al mundo ${NUMERO[nombre]}: ${nombre}` });

async function entrar(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
}

async function abrirMapa(page: Page) {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
}

// ── RF-030, RF-033: posición inicial y mundos bloqueados ──────────────────

Dado('un niño de 9 años que ya hizo su reto inicial, con la tablet activada', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]); // nacido en 2017
  await retoTerminado(request, mundo.aula, 'Mateo'); // RN-05; sin destacar en LIT ni VOC: mundo 1 (RF-033)
  await tabletDelAulaActivada(page, request, mundo.aula);
});

Cuando('entra con su avatar y su PIN', async ({ page }) => {
  await entrar(page);
});

Entonces('su mapa lo ubica en el mundo {string}', async ({ page }, nombre: string) => {
  await abrirMapa(page);
  await expect(enlaceDelMundo(page, nombre)).toContainText('¡Estás aquí!');
});

Entonces('los mundos {string}, {string}, {string} y {string} aparecen bloqueados', async ({ page }, a: string, b: string, c: string, d: string) => {
  for (const nombre of [a, b, c, d]) {
    await expect(enlaceDelMundo(page, nombre)).toHaveCount(0);
    await expect(page.getByRole('listitem').filter({ hasText: nombre }).getByText('Completa el mundo anterior')).toBeVisible();
  }
});

// ── RF-032: misiones ──────────────────────────────────────────────────────

Dado('que hay una lectura publicada para 8–9 años llamada {string}', async ({ request, mundo }, titulo: string) => {
  const sufijo = Date.now().toString(36);
  de(mundo).lectura = (await lecturaPublicada(request, { titulo: `${titulo} ${sufijo}`, rangoEdad: 'R2', tematica: `Aventura ${sufijo}` })).titulo;
});

Cuando('una editora arma en el mundo {string} la misión {string} con esa lectura', async ({ page, mundo }, nombreMundo: string, titulo: string) => {
  const e = de(mundo);
  e.mision = tituloMision(titulo);
  await ingresarBackoffice(page, await cuentaBackoffice('EDITOR'));
  await page.goto('/backoffice/misiones');
  await page.getByLabel('Mundo', { exact: true }).selectOption({ label: `Mundo ${NUMERO[nombreMundo]} · ${nombreMundo}` });
  await page.getByLabel('Edad', { exact: true }).selectOption('R2');
  await page.getByRole('button', { name: '+ Nueva misión' }).click();
  await page.getByLabel('Título de la misión').fill(e.mision);
  await page.getByRole('button', { name: `Agregar ${e.lectura}` }).click();
  await page.getByRole('button', { name: 'Crear misión' }).click();
  await expect(page.getByText('Misión creada.')).toBeVisible();
  await salirDelPanel(page);
});

Cuando('un niño de 9 años abre el mundo {string}', async ({ page, request, mundo }, nombre: string) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo');
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrar(page);
  await abrirMapa(page);
  await enlaceDelMundo(page, nombre).click();
  await expect(page.getByRole('heading', { level: 1, name: nombre })).toBeVisible();
});

Entonces('ve la misión {string} por empezar, con la lectura {string}', async ({ page, mundo }, _titulo: string, _lectura: string) => {
  // Los títulos reales llevan un sufijo único por escenario.
  const e = de(mundo);
  const mision = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name: e.mision }) });
  await expect(mision.getByText('Por empezar')).toBeVisible();
  await expect(mision.getByText(e.lectura as string)).toBeVisible();
});

Cuando('intenta abrir el mundo {string}', async ({ page }, nombre: string) => {
  await page.goto(`/estudiante/mundos/${await idMundo(NUMERO[nombre] as number)}`);
});

Entonces('le explica que primero debe completar el mundo anterior', async ({ page }) => {
  await expect(page.getByText('Este mundo todavía está bloqueado: completa el anterior para abrirlo')).toBeVisible();
});

// ── RF-031: desbloqueo y celebración ──────────────────────────────────────

Dado('que ya entró y tiene su mapa', async ({ page }) => {
  await entrar(page);
  await expect(enlaceDelMundo(page, 'Explorador')).toContainText('¡Estás aquí!');
});

Cuando('cumple el umbral de maestría y misiones del Explorador', async ({ mundo }) => {
  // Lo que hará el evento de los Módulos 6 y 7 (RN-09); la regla se prueba en los niveles 1 y 2.
  await simularDesbloqueo(mundo.aula?.estudiantes['Mateo'] as string, 2);
});

Cuando('vuelve a su mapa', async ({ page }) => {
  await abrirMapa(page);
});

Entonces('ve la celebración {string}', async ({ page }, titulo: string) => {
  const celebracion = page.getByRole('dialog', { name: titulo });
  await expect(celebracion).toBeVisible();
  await expect(celebracion.getByRole('button', { name: '¡Vamos!' })).toBeFocused();
});

Entonces('al cerrarla, el Explorador aparece completado y la celebración no vuelve a salir', async ({ page }) => {
  const vista = page.waitForResponse((r) => r.url().endsWith('/celebracion') && r.status() === 204);
  await page.getByRole('dialog').getByRole('button', { name: '¡Vamos!' }).click();
  await vista;
  await expect(enlaceDelMundo(page, 'Explorador')).toContainText('¡Mundo completado!');
  await page.reload();
  await expect(enlaceDelMundo(page, 'Detective')).toContainText('¡Estás aquí!');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
