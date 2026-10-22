import { expect, Page } from '@playwright/test';

import { idMundo, tituloMision } from '../support/aventura';
import { sesionBackoffice } from '../support/contenido';
import { retoTerminado } from '../support/diagnostico';
import { abrirAula, docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../support/escuela';
import { escribirPin, esperarAreaEstudiante, salirDelPanel } from '../support/iam';
import { DESENLACE_RIO, ENUNCIADOS, itemDeLectura, itemsRespondidos, lecturaKilla, leerPorApi, respuestaGuardada } from '../support/lectura';
import { maestriaGuardada } from '../support/progreso';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos de los escenarios de la lectura interactiva (RF-038 a RF-051, UAT-02, UAT-03). */

const NUMERO_MUNDO: Record<string, number> = { Explorador: 1, Detective: 2, Constructor: 3, Juez: 4, Narrador: 5 };

async function entrarComoMateo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
}

const pregunta = (page: Page, enunciado: string) => expect(page.getByRole('heading', { level: 2, name: enunciado, exact: true })).toBeVisible();

// ── UAT-02: pistas progresivas (RF-045, RN-06, RN-07) ─────────────────────

Dado('un estudiante en una lectura del mundo {string}', async ({ page, request, mundo }, nombre: string) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  // RF-033: con buen LIT y VOC en su reto inicial empieza en el Detective.
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']);
  const killa = await lecturaKilla(request);
  mundo.killa = killa;
  const mision = await request.post(`/api/v1/backoffice/mundos/${await idMundo(NUMERO_MUNDO[nombre] as number)}/misiones`, {
    headers: await sesionBackoffice(request, killa.editora),
    data: { rangoEdad: 'R2', titulo: tituloMision('La llama de Killa'), lecturaIds: [killa.lecturaId] },
  });
  expect(mision.status(), await mision.text()).toBe(201);

  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
  await page.getByRole('link', { name: `Entrar al mundo ${NUMERO_MUNDO[nombre]}: ${nombre}` }).click();
  await page.getByRole('link', { name: `Leer: ${killa.titulo}` }).click();
  await page.getByLabel('Lo que creo que pasará').fill('Creo que la llama se enfermará');
  await page.getByRole('button', { name: 'Empezar a leer' }).click();
});

Dado('un ítem de inferencia con dificultad {int} y tres pistas definidas', async ({ page, mundo }, dificultad: number) => {
  await pregunta(page, ENUNCIADOS.seleccion);
  const item = await itemDeLectura(mundo.killa!.lecturaId, ENUNCIADOS.seleccion);
  expect(item).toMatchObject({ habilidad: 'INF', nivelDificultad: dificultad });
  expect(item.pistas.map((p) => p.nivel).sort()).toEqual(['P1', 'P2', 'P3']);
});

Cuando('responde incorrectamente', async ({ page }) => {
  await page.getByRole('button', { name: 'Opción A: Estaba feliz' }).click();
});

Entonces('ve la pista P1 que le indica a qué parte del texto volver', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Tus pistas' })).toContainText('Pista 1: Vuelve a la oración que acabas de leer.');
});

Entonces('no se muestra la respuesta correcta', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Mira por qué' })).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('Más adelante el texto dice que tenía una espina');
  await expect(page.getByRole('main')).not.toContainText('espina'); // el texto aún no llega a la respuesta
});

Cuando('responde correctamente en el segundo intento', async ({ page }) => {
  await page.getByRole('button', { name: 'Opción B: Le dolía algo' }).click();
  await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();
});

Entonces('su maestría en {word} se actualiza con un puntaje de ítem de {word}', async ({ mundo }, habilidad: string, puntaje: string) => {
  const estudianteId = mundo.aula!.estudiantes['Mateo'] as string;
  const valor = Number(puntaje.replace(',', '.'));
  const guardada = await respuestaGuardada(estudianteId, ENUNCIADOS.seleccion);
  expect(guardada).toMatchObject({ habilidad, esCorrecta: true, pistasUsadas: 1 });
  expect(Number(guardada.puntajeItem)).toBe(valor);
  expect(await itemsRespondidos(estudianteId)).toContainEqual(expect.objectContaining({ habilidad, puntajeItem: valor, pistasUsadas: 1 }));
  // Módulo 7: Progreso la recalcula con RN-07: EMA (α = 0,3) de 0,75 × (0,8 + 0,1 × 3) × 100 = 82,5.
  const m = await maestriaGuardada(estudianteId, habilidad);
  const ultimo = m.cambios.at(-1)!;
  expect(ultimo.origen).toBe('ITEM');
  expect(m.valor).toBeCloseTo(Math.round((0.3 * 82.5 + 0.7 * ultimo.anterior) * 100) / 100, 2);
});

// ── UAT-03: encuentra la evidencia (RF-043) ───────────────────────────────

Dado('un ítem {string} cuya clave son las oraciones {string} y {string}', async ({ page, request, mundo }, _tipo: string, a: string, b: string) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  mundo.killa = await lecturaKilla(request);
  const item = await itemDeLectura(mundo.killa.lecturaId, ENUNCIADOS.evidencia);
  expect(item.claves.map((c) => c.oracion.texto).sort()).toEqual([a, b].sort());
  await leerPorApi(request, mundo.aula, 'Mateo', mundo.killa.lecturaId, { hasta: ENUNCIADOS.evidencia });
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
  await page.goto(`/estudiante/lecturas/${mundo.killa.lecturaId}`);
  await pregunta(page, ENUNCIADOS.evidencia);
});

const texto = (page: Page) => page.getByRole('article', { name: 'El texto' });

Cuando('el estudiante selecciona la oración {string}', async ({ page }, oracion: string) => {
  await texto(page).getByRole('button', { name: oracion }).click();
  await page.getByRole('button', { name: 'Esta es mi evidencia' }).click();
});

Cuando('el estudiante selecciona las oraciones {string} y {string}', async ({ page }, a: string, b: string) => {
  await texto(page).getByRole('button', { name: a }).click();
  await texto(page).getByRole('button', { name: b }).click();
  await page.getByRole('button', { name: 'Esta es mi evidencia' }).click();
});

Entonces('la evidencia se considera correcta', async ({ page }) => {
  await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();
  await expect(page.getByRole('heading', { name: '¿Qué camino eliges?' })).toBeVisible();
});

Entonces('la evidencia se considera incorrecta', async ({ page }) => {
  await expect(page.getByText('Casi. Lee la pista y vuelve a intentarlo.')).toBeVisible();
  await pregunta(page, ENUNCIADOS.evidencia);
});

Entonces('recibe la pista P1 resaltando el párrafo donde buscar', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Tus pistas' })).toContainText('Pista 1: Busca en el párrafo que acabas de leer.');
  await expect(texto(page).locator('.texto-lectura__parrafo--pista')).toContainText('Un día Pancho no quiso comer.');
});

// ── RF-038, RF-047: predicción y cierre ───────────────────────────────────

Dado('un estudiante que predijo {string} y terminó las actividades de su lectura', async ({ page, request, mundo }, prediccion: string) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  mundo.killa = await lecturaKilla(request);
  await leerPorApi(request, mundo.aula, 'Mateo', mundo.killa.lecturaId, { prediccion });
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
});

Cuando('llega al cierre', async ({ page, mundo }) => {
  await page.goto(`/estudiante/lecturas/${mundo.killa!.lecturaId}`);
  await expect(page.getByRole('heading', { name: '¿Acertaste?' })).toBeVisible();
});

Entonces('ve lo que predijo junto a lo que pasó', async ({ page }) => {
  const cierre = page.getByRole('region', { name: '¿Acertaste?' });
  await expect(cierre).toContainText('Lo que pensaste');
  await expect(cierre).toContainText('Creo que la llama se enfermará');
  await expect(cierre).toContainText('Lo que pasó');
  await expect(cierre).toContainText(DESENLACE_RIO);
});

Entonces('al escribir su reflexión la lectura queda terminada', async ({ page }) => {
  await page.getByRole('region', { name: '¿Acertaste?' }).getByRole('textbox').fill('Pensé que se enfermaba, pero tenía una espina');
  await page.getByRole('button', { name: 'Terminar mi lectura' }).click();
  await expect(page.getByRole('heading', { name: '¡Lectura terminada!' })).toBeVisible();
});

// ── RF-051: rúbrica docente ───────────────────────────────────────────────

Dado('un estudiante que escribió una respuesta abierta en su lectura', async ({ request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  mundo.killa = await lecturaKilla(request);
  await leerPorApi(request, mundo.aula, 'Mateo', mundo.killa.lecturaId, { terminar: true });
});

Cuando('su docente la valora como {string}', async ({ page, mundo }, nivel: string) => {
  await abrirAula(page, mundo.aula!);
  const fila = page.getByRole('region', { name: 'Respuestas por revisar' }).getByRole('listitem', { name: 'Respuesta de Mateo' });
  await expect(fila).toContainText(ENUNCIADOS.escritura);
  await fila.getByLabel(new RegExp(`· ${nivel}`)).check();
  await fila.getByRole('button', { name: 'Guardar valoración' }).click();
  await expect(page.getByText('Valoración guardada para Mateo.')).toBeVisible();
});

Entonces('la respuesta queda valorada con el nivel {int}', async ({ page }, nivel: number) => {
  const revision = page.getByRole('region', { name: 'Respuestas por revisar' });
  await revision.getByRole('button', { name: 'Valoradas' }).click();
  await expect(revision.getByRole('listitem', { name: 'Respuesta de Mateo' })).toContainText(`Nivel ${nivel}:`);
  await salirDelPanel(page);
});
