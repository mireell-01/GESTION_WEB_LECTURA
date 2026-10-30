import { expect, Page } from '@playwright/test';

import { activarAsistente, ninoEnLaPregunta, turnosGuardados } from '../support/asistente';
import { sesionDelNino } from '../support/diagnostico';
import { abrirAula, docenteConAula } from '../support/escuela';
import { familiaConConsentimiento, hijoDeFamilia } from '../support/familia';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../support/lectura';
import { Cuando, Dado, Entonces, Mundo } from './fixtures';

/** Nivel 4 — Pasos de los escenarios del asistente de lectura (RF-072 a RF-075, RN-16, RN-17). */

const burbujas = (page: Page) => page.getByRole('list', { name: 'Conversación con tu guía' }).getByRole('listitem');
const tarjeta = (page: Page) => page.getByRole('region', { name: 'Asistente de lectura' });
const respuestaDeMateo = (page: Page) => page.getByRole('listitem', { name: 'Respuesta de Mateo' });

async function abrirAyuda(page: Page) {
  await page.getByRole('button', { name: '¿Necesitas ayuda para pensar?' }).click();
}

async function preguntar(page: Page, mensaje: string) {
  const antes = await burbujas(page).count();
  await page.getByLabel('Escribe tu pregunta').fill(mensaje);
  await page.getByRole('button', { name: 'Preguntar' }).click();
  await expect(burbujas(page)).toHaveCount(antes + 2);
}

/** Lucía en la inferencia de Killa, con (o sin) el asistente activado por su familia. */
async function luciaEnLaPregunta(page: Page, request: Parameters<typeof lecturaKilla>[0], mundo: Mundo, activado: boolean) {
  const killa = await lecturaKilla(request);
  const familia = await familiaConConsentimiento(request, 'uat-asistente');
  const lucia = await hijoDeFamilia(request, familia, 'Lucía');
  if (activado) await activarAsistente(request, familia, lucia);
  mundo.familia = { ...familia, hijos: { Lucía: lucia } };
  await ninoEnLaPregunta(page, request, familia, 'Lucía', killa.lecturaId);
}

// ── Preparación ──────────────────────────────────────────────────────────────

Dado('Lucía, con el asistente activado por su familia, está en la pregunta de por qué Pancho no quiso comer', async ({ page, request, mundo }) => {
  await luciaEnLaPregunta(page, request, mundo, true);
  await abrirAyuda(page);
});

Dado('Lucía, sin el asistente activado, está en la pregunta de por qué Pancho no quiso comer', async ({ page, request, mundo }) => {
  await luciaEnLaPregunta(page, request, mundo, false);
});

Dado('una docente con Mateo y Ana en su aula', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }, { alias: 'Ana', avatar: 'buho' }]);
  await abrirAula(page, mundo.aula);
});

Dado('una docente con la respuesta abierta de Mateo por revisar', async ({ page, request, mundo }) => {
  const killa = await lecturaKilla(request);
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await leerPorApi(request, mundo.aula, 'Mateo', killa.lecturaId, { nino: await sesionDelNino(request, mundo.aula, 'Mateo'), terminar: true });
  await abrirAula(page, mundo.aula);
});

// ── Acciones ─────────────────────────────────────────────────────────────────

Cuando('toca {string}', async ({ page }, atajo: string) => {
  const antes = await burbujas(page).count();
  await page.getByRole('group', { name: 'Ayudas rápidas' }).getByRole('button', { name: atajo }).click();
  await expect(burbujas(page)).toHaveCount(antes + 2);
});

Cuando('escribe {string}', async ({ page }, mensaje: string) => {
  await preguntar(page, mensaje);
});

Cuando('conversa {int} veces con el guía', async ({ page }, veces: number) => {
  for (let i = 1; i <= veces; i++) await preguntar(page, i % 2 ? '¿Dónde busco?' : 'No entiendo');
});

Cuando('activa el asistente para todos', async ({ page }) => {
  await tarjeta(page).getByRole('button', { name: 'Activar para todos', exact: true }).click();
  await expect(tarjeta(page)).toContainText('Activado para 2 de 2 estudiantes.');
});

Cuando('lo desactiva para Ana', async ({ page }) => {
  await tarjeta(page).getByText('Elegir estudiantes').click();
  await tarjeta(page).getByRole('checkbox', { name: /Ana$/ }).uncheck();
});

Cuando('pide {string}', async ({ page }, boton: string) => {
  await respuestaDeMateo(page).getByRole('button', { name: boton }).click();
});

// ── Resultados ───────────────────────────────────────────────────────────────

Entonces('el guía le explica qué pide la pregunta', async ({ page }) => {
  await expect(burbujas(page).nth(1)).toContainText(`Leamos la pregunta despacio: «${ENUNCIADOS.seleccion}»`);
  await expect(burbujas(page).nth(1)).toContainText('Te pide elegir una opción');
});

Entonces('le dice que no le dará la respuesta y le recuerda que puede «Pedir una pista»', async ({ page }) => {
  await expect(burbujas(page).last()).toContainText('No te voy a decir la respuesta');
  await expect(burbujas(page).last()).toContainText('«Pedir una pista»');
});

Entonces('en la conversación no aparece la respuesta {string}', async ({ page }, clave: string) => {
  await expect(page.getByRole('list', { name: 'Conversación con tu guía' })).not.toContainText(clave);
});

Entonces('ve que le quedan {int} preguntas en esta lectura', async ({ page }, n: number) => {
  await expect(page.getByText(`Te quedan ${n} preguntas en esta lectura.`)).toBeVisible();
});

Entonces('el guía le pide que no comparta datos personales', async ({ page }) => {
  await expect(burbujas(page).last()).toContainText('Aquí no compartas datos personales');
});

Entonces('lo que quedó guardado de la conversación no tiene su apellido ni su celular', async ({ mundo }) => {
  const guardado = (await turnosGuardados(mundo.familia!.hijos['Lucía'] as string)).join(' ');
  expect(guardado).toContain('[nombre]');
  expect(guardado).not.toMatch(/Quispe|987654321/);
});

Entonces('ve que ya conversaron 10 veces en esta lectura', async ({ page }) => {
  await expect(page.getByText('Ya conversamos 10 veces en esta lectura. ¡Sigue tú, lo estás haciendo muy bien!')).toBeVisible();
});

Entonces('ya no puede escribir más preguntas', async ({ page }) => {
  await expect(page.getByLabel('Escribe tu pregunta')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Ayudas rápidas' })).toHaveCount(0);
});

Entonces('no ve el botón {string}', async ({ page }, boton: string) => {
  await expect(page.getByRole('heading', { level: 2, name: ENUNCIADOS.seleccion, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: boton })).toHaveCount(0);
});

Entonces('la tarjeta del asistente dice {string}', async ({ page }, texto: string) => {
  await expect(tarjeta(page)).toContainText(texto);
});

Entonces('el comentario se llena con un borrador que empieza con {string}', async ({ page }, inicio: string) => {
  await expect(respuestaDeMateo(page).getByLabel('Comentario para el estudiante (opcional)')).toHaveValue(new RegExp(`^${inicio} .+\\?$`));
});

Entonces('le avisa que es un borrador y que Mateo solo verá lo que ella guarde', async ({ page }) => {
  await expect(respuestaDeMateo(page).getByText('Es un borrador: revísalo y cámbialo. El estudiante solo verá lo que guardes.')).toBeVisible();
});
