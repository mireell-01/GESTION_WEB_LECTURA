import { expect, Page } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../support/diagnostico';
import { diaLima, docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../support/escuela';
import { asientosDe, avanceInsignia, fijarRacha, puntosGuardados, rachaGuardada } from '../support/gamificacion';
import { escribirPin, esperarAreaEstudiante } from '../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../support/lectura';
import { Cuando, Dado, Entonces, Mundo } from './fixtures';

/** Nivel 4 — Pasos de los escenarios de gamificación (RF-056 a RF-062, RN-11, RN-12, RN-18, UAT-02, UAT-03). */

const CODIGO_INSIGNIA: Record<string, string> = {
  'Primera lectura': 'PRIMERA_LECTURA',
  'Detective de Evidencias': 'DETECTIVE_EVIDENCIAS',
  'Lector Perseverante': 'LECTOR_PERSEVERANTE',
};

async function entrarComoMateo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
}

const mateo = (mundo: Mundo) => mundo.aula!.estudiantes['Mateo'] as string;
const insignias = (page: Page) => page.getByRole('list', { name: 'Insignias' }).getByRole('listitem');
const numeros = (page: Page) => page.getByRole('list', { name: 'Tus números' });
const retoDelDia = (page: Page) => page.getByRole('region', { name: 'Reto del día' });

async function abrirPasaporte(page: Page) {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Pasaporte' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pasaporte del Lector' })).toBeVisible();
}

/** Mateo, de 9 años, con su reto inicial bien en literal y vocabulario (RF-033: empieza en el Detective). */
async function prepararMateo(request: Parameters<typeof docenteConAula>[0], mundo: Mundo) {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']);
}

// ── UAT-02 y UAT-03 (lectura.feature): lo que Gamificación otorga por cada pregunta ──

Entonces('recibe {int} puntos por corregir tras pista', async ({ mundo }, puntos: number) => {
  expect(await asientosDe(mateo(mundo))).toContainEqual({ motivo: 'CORRECTO_TRAS_PISTA', puntos });
});

Entonces('el progreso hacia la insignia {string} aumenta en {int}', async ({ page, mundo }, nombre: string, n: number) => {
  expect(await avanceInsignia(mateo(mundo), CODIGO_INSIGNIA[nombre] as string)).toBe(n);
  // RF-059: el pasaporte lo muestra al instante.
  await page.goto('/estudiante/pasaporte');
  await expect(insignias(page).filter({ hasText: nombre })).toContainText(new RegExp(`${n} de \\d+`));
});

// ── RF-056, RF-058, RF-059: lo que ganó al terminar y su pasaporte ───────

Dado('un niño de 9 años que respondió su lectura hasta la última pregunta', async ({ page, request, mundo }) => {
  await prepararMateo(request, mundo);
  mundo.killa = await lecturaKilla(request);
  await leerPorApi(request, mundo.aula!, 'Mateo', mundo.killa.lecturaId, { hasta: ENUNCIADOS.defiende });
  await tabletDelAulaActivada(page, request, mundo.aula!);
  await entrarComoMateo(page);
  const pasaporteInicial = page.waitForResponse((r) => r.url().endsWith('/api/v1/yo/pasaporte') && r.ok());
  await page.goto(`/estudiante/lecturas/${mundo.killa.lecturaId}`);
  await expect(page.getByRole('heading', { level: 2, name: ENUNCIADOS.defiende })).toBeVisible();
  await pasaporteInicial;
  mundo.puntos = await puntosGuardados(mateo(mundo));
});

Cuando('responde la última pregunta y termina su lectura', async ({ page }) => {
  await page.getByRole('button', { name: 'Opción A: El texto dice que tenía una espina' }).click();
  await page.getByRole('region', { name: '¿Acertaste?' }).getByRole('textbox').fill('Pensé que se enfermaba, pero tenía una espina');
  await page.getByRole('button', { name: 'Terminar mi lectura' }).click();
  await expect(page.getByRole('heading', { name: '¡Lectura terminada!' })).toBeVisible();
});

Entonces('ve cuántos puntos ganó y su nueva insignia {string}', async ({ page, mundo }, nombre: string) => {
  const ganados = (await puntosGuardados(mateo(mundo))) - (mundo.puntos ?? 0);
  const logros = page.getByRole('region', { name: `¡Ganaste ${ganados} puntos!` });
  await expect(logros).toBeVisible();
  await expect(logros.getByRole('list', { name: 'Insignias nuevas' })).toContainText(`Nueva insignia: ${nombre}`);
});

Entonces('su Pasaporte del Lector muestra la insignia ganada y la lectura terminada', async ({ page, mundo }) => {
  await page.getByRole('link', { name: 'Ver mi pasaporte' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Pasaporte del Lector' })).toBeVisible();
  await expect(insignias(page).filter({ hasText: 'Primera lectura' })).toContainText('Ganada el');
  await expect(page.getByRole('list', { name: 'Lecturas terminadas' })).toContainText(mundo.killa!.titulo);
  await expect(numeros(page)).toContainText(`${await puntosGuardados(mateo(mundo))} puntos`);
});

// ── RF-060, RN-18: el reto del día ──────────────────────────────────────

Dado('un niño de 9 años que hizo su reto inicial bien en literal y vocabulario', async ({ page, request, mundo }) => {
  await prepararMateo(request, mundo);
  await tabletDelAulaActivada(page, request, mundo.aula!);
});

Cuando('abre su inicio', async ({ page }) => {
  await entrarComoMateo(page);
});

Entonces('ve el reto del día para {string}', async ({ page }, habilidad: string) => {
  await expect(retoDelDia(page)).toContainText(`Responde bien 3 preguntas para ${habilidad}`);
  await expect(retoDelDia(page)).toContainText('0 de 3');
});

Entonces('el reto es el mismo cada vez que lo abre ese día', async ({ page, request, mundo }) => {
  const nino = await sesionDelNino(request, mundo.aula!, 'Mateo');
  const primero = await (await request.get('/api/v1/yo/reto-del-dia', { headers: nino })).json();
  await page.reload();
  await expect(retoDelDia(page)).toContainText('descubrir lo que no se dice');
  const segundo = await (await request.get('/api/v1/yo/reto-del-dia', { headers: nino })).json();
  expect(segundo.id).toBe(primero.id);
  expect(primero).toMatchObject({ fecha: diaLima(), habilidad: 'INF' });
});

// ── RF-061: racha con comodín ───────────────────────────────────────────

Dado('un niño que leyó {int} días seguidos hasta anteayer', async ({ request, mundo }, dias: number) => {
  await prepararMateo(request, mundo);
  mundo.killa = await lecturaKilla(request);
  await fijarRacha(mateo(mundo), dias, 2);
});

Cuando('termina una lectura hoy', async ({ request, mundo }) => {
  await leerPorApi(request, mundo.aula!, 'Mateo', mundo.killa!.lecturaId, { terminar: true });
});

Entonces('su racha llega a {int} días usando el comodín de la semana', async ({ mundo }, dias: number) => {
  const racha = await rachaGuardada(mateo(mundo));
  expect(racha).toMatchObject({ diasActuales: dias, mejorRacha: dias });
  expect(racha?.comodinUsadoSemana).not.toBeNull();
});

Entonces('gana {int} puntos de racha y la insignia {string}', async ({ page, request, mundo }, puntos: number, nombre: string) => {
  expect((await asientosDe(mateo(mundo))).filter((a) => a.motivo.startsWith('RACHA_'))).toEqual([{ motivo: 'RACHA_7', puntos }]);
  await tabletDelAulaActivada(page, request, mundo.aula!);
  await entrarComoMateo(page);
  await abrirPasaporte(page);
  await expect(insignias(page).filter({ hasText: nombre })).toContainText('Ganada el');
  await expect(numeros(page)).toContainText('🔥 7');
});

// ── RN-12: repetir una lectura ──────────────────────────────────────────

Dado('un niño que ya terminó una lectura', async ({ request, mundo }) => {
  await prepararMateo(request, mundo);
  mundo.killa = await lecturaKilla(request);
  mundo.nino = await sesionDelNino(request, mundo.aula!, 'Mateo');
  await leerPorApi(request, mundo.aula!, 'Mateo', mundo.killa.lecturaId, { nino: mundo.nino, terminar: true });
  mundo.asientos = (await asientosDe(mateo(mundo))).length;
});

Cuando('la vuelve a leer completa', async ({ request, mundo }) => {
  await leerPorApi(request, mundo.aula!, 'Mateo', mundo.killa!.lecturaId, { nino: mundo.nino, terminar: true });
});

Entonces('cada logro de la repetición vale el 25 % y no suma a las insignias', async ({ mundo }) => {
  const todos = await asientosDe(mateo(mundo));
  const [primera, repeticion] = [todos.slice(0, mundo.asientos), todos.slice(mundo.asientos)];
  const BASE: Record<string, number> = { ITEM_CORRECTO: 10, RESPUESTA_ABIERTA: 10, LECTURA_COMPLETADA: 20 };
  for (const motivo of Object.keys(BASE)) {
    const antes = primera.filter((a) => a.motivo === motivo);
    const ahora = repeticion.filter((a) => a.motivo === motivo);
    expect(antes.every((a) => a.puntos === BASE[motivo])).toBe(true);
    expect(ahora.map((a) => a.puntos)).toEqual(antes.map(() => Math.round((BASE[motivo] as number) * 0.25)));
  }
  expect(await avanceInsignia(mateo(mundo), 'DETECTIVE_EVIDENCIAS')).toBe(1);
});

// ── RF-062: recompensas ─────────────────────────────────────────────────

Dado('un niño que ganó puntos leyendo', async ({ page, request, mundo }) => {
  await prepararMateo(request, mundo);
  mundo.killa = await lecturaKilla(request);
  await leerPorApi(request, mundo.aula!, 'Mateo', mundo.killa.lecturaId, { terminar: true });
  mundo.puntos = await puntosGuardados(mateo(mundo));
  await tabletDelAulaActivada(page, request, mundo.aula!);
  await entrarComoMateo(page);
  await abrirPasaporte(page);
});

Cuando('canjea la {string} en su pasaporte', async ({ page }, nombre: string) => {
  await page.getByRole('list', { name: 'Recompensas' }).getByRole('button', { name: new RegExp(`^Canjear ${nombre} por \\d+ monedas$`) }).click();
});

Entonces('la {string} es suya', async ({ page }, nombre: string) => {
  await expect(page.getByText(`¡${nombre}: ya es tuya!`)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Recompensas' }).getByRole('listitem').filter({ hasText: nombre })).toContainText('¡Es tuya!');
});

Entonces('sus monedas bajan en {int} y sus puntos siguen iguales', async ({ page, mundo }, costo: number) => {
  await expect(numeros(page)).toContainText(`🪙 ${Math.floor((mundo.puntos ?? 0) / 10) - costo}`);
  await expect(numeros(page)).toContainText(`${mundo.puntos} puntos`);
  expect(await puntosGuardados(mateo(mundo))).toBe(mundo.puntos);
});
