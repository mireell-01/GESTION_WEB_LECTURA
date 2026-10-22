import { expect, Page } from '@playwright/test';

import { claveDelEnunciado, retoTerminado } from '../support/diagnostico';
import { abrirAula, docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../support/escuela';
import { escribirPin, esperarAreaEstudiante, salirDelPanel } from '../support/iam';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos de los escenarios del Diagnóstico (RF-034 a RF-037, RN-05). */

/** Responde la pregunta en pantalla: la correcta en las habilidades indicadas y otra en las demás. */
async function responder(page: Page, acertar: string[]) {
  const enunciado = page.getByRole('heading', { level: 3 });
  const texto = (await enunciado.textContent()) as string;
  const clave = await claveDelEnunciado(texto);
  await page.getByRole('button').filter({ has: page.getByText(acertar.includes(clave.habilidad) ? clave.correcta : clave.incorrecta, { exact: true }) }).click();
  await expect(page.getByRole('heading', { level: 3, name: texto, exact: true })).toHaveCount(0); // llegó otra pregunta o el resultado
}

/** Responde hasta el final. Antes de cada vuelta espera la pregunta o el resultado, para no cortar mientras la página carga. */
async function terminarReto(page: Page, acertar: string[]) {
  const pregunta = page.getByRole('heading', { level: 3 });
  const fin = page.getByRole('heading', { level: 1, name: '¡Reto completado!' });
  for (;;) {
    await expect(pregunta.or(fin)).toBeVisible();
    if (await fin.isVisible()) return;
    await responder(page, acertar);
  }
}

async function empezarReto(page: Page) {
  await page.getByRole('region', { name: '¡Tu reto inicial te espera!' }).getByRole('link').click();
  await expect(page.getByText(/^Pregunta \d+ de 15$/)).toBeVisible();
}

Dado('un niño de 9 años sin reto inicial, con la tablet del aula activada', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]); // nacido en 2017
  await tabletDelAulaActivada(page, request, mundo.aula);
});

Dado('entró con su avatar y su PIN', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
});

// ── RF-034, RF-035, RF-033 (UAT-01) ───────────────────────────────────────

Cuando('completa las 15 preguntas de su reto acertando en comprensión literal y vocabulario', async ({ page }) => {
  await empezarReto(page);
  await terminarReto(page, ['LIT', 'VOC']);
});

Entonces('ve lo que ya sabe hacer en cada una de las 5 habilidades', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Lo que ya sabes hacer' }).getByRole('listitem')).toHaveCount(5);
});

Entonces('el mapa de aventuras lo ubica en el mundo {string}', async ({ page }, nombre: string) => {
  await page.getByRole('link', { name: 'Ver mi mapa' }).click();
  await expect(page.getByRole('link', { name: new RegExp(`: ${nombre}$`) })).toContainText('¡Estás aquí!');
});

Entonces('el mundo {string} aparece como completado', async ({ page }, nombre: string) => {
  await expect(page.getByRole('link', { name: new RegExp(`: ${nombre}$`) })).toContainText('¡Mundo completado!');
});

// ── RN-05 ─────────────────────────────────────────────────────────────────

Cuando('abre sus mundos', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
});

Entonces('le pide primero su reto inicial y no le deja entrar a ningún mundo', async ({ page }) => {
  await expect(page.getByText('Primero, tu reto inicial')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Entrar al mundo/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ir a mi reto' })).toBeVisible();
});

// ── RF-036 ────────────────────────────────────────────────────────────────

Cuando('responde 3 preguntas de su reto y lo pausa', async ({ page }) => {
  await empezarReto(page);
  for (let i = 0; i < 3; i++) await responder(page, []);
  await page.getByRole('button', { name: 'Pausar y seguir después' }).click();
});

Entonces('su inicio le dice que va en la pregunta 4 de 15', async ({ page }) => {
  await expect(page.getByRole('region', { name: '¡Tu reto inicial te espera!' })).toContainText('Vas en la pregunta 4 de 15');
});

Entonces('al continuar, el reto sigue en la pregunta 4', async ({ page }) => {
  await page.getByRole('link', { name: 'Continuar mi reto' }).click();
  await expect(page.getByText('Pregunta 4 de 15', { exact: true })).toBeVisible(); // exacto: el inicio también dice «Vas en la pregunta 4 de 15»
});

// ── RF-037 ────────────────────────────────────────────────────────────────

Dado('un niño de 9 años que terminó su reto inicial sin acertar', async ({ request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo');
});

Cuando('su docente le asigna un reto de repaso', async ({ page, mundo }) => {
  await abrirAula(page, mundo.aula!);
  const repaso = page.getByRole('region', { name: 'Reto de repaso' });
  await repaso.getByRole('button', { name: 'Asignar reto de repaso a toda el aula' }).click();
  await expect(repaso.getByText('Reto de repaso asignado a 1 estudiante.')).toBeVisible();
  await salirDelPanel(page);
});

Cuando('el niño lo termina acertando todo', async ({ request, mundo }) => {
  await retoTerminado(request, mundo.aula!, 'Mateo', ['LIT', 'VOC', 'INF', 'CRI', 'ARG']);
});

Entonces('la docente ve que avanzó en comprensión literal', async ({ page, mundo }) => {
  await abrirAula(page, mundo.aula!);
  const fila = page.getByRole('region', { name: 'Reto de repaso' }).getByRole('listitem').filter({ hasText: 'Mateo' });
  await expect(fila).toContainText('Repaso: Terminado');
  await expect(fila.getByLabel('Cambios de Mateo desde el reto inicial')).toContainText('Literal +100');
});
