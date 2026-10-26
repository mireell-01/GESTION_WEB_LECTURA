import { expect, Page, test as base } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../../support/diagnostico';
import { docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../../support/escuela';
import { puntosGuardados } from '../../support/gamificacion';
import { escribirPin, esperarAreaEstudiante, ipSimulada } from '../../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../../support/lectura';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Gamificación de punta a punta (RF-056 a RF-062) en escritorio, tablet y celular: al terminar
 * una lectura el niño ve lo que ganó y su Pasaporte del Lector lo refleja al instante; el inicio muestra
 * su marcador y el reto del día; en la tienda canjea con monedas sin perder puntos.
 */
test.describe('Gamificación: pasaporte, reto del día y recompensas (RF-056 a RF-062)', () => {
  test.setTimeout(150_000);

  async function entrar(page: Page, alias: string) {
    await page.goto('/');
    await page.getByRole('button', { name: alias }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, alias);
  }

  const numeros = (page: Page) => page.getByRole('list', { name: 'Tus números' });

  test('al terminar una lectura ve lo que ganó y su pasaporte lo refleja al instante (RF-058, RF-059)', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await retoTerminado(request, aula, 'Mateo', ['LIT', 'VOC']);
    const killa = await lecturaKilla(request);
    await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { hasta: ENUNCIADOS.defiende });
    const id = aula.estudiantes['Mateo'] as string;

    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Mateo');
    const pasaporteInicial = page.waitForResponse((r) => r.url().endsWith('/api/v1/yo/pasaporte') && r.ok());
    await page.goto(`/estudiante/lecturas/${killa.lecturaId}`);
    await expect(page.getByRole('heading', { level: 2, name: ENUNCIADOS.defiende })).toBeVisible();
    await pasaporteInicial; // lo que tenía al abrir la lectura
    const antes = await puntosGuardados(id);

    await page.getByRole('button', { name: 'Opción A: El texto dice que tenía una espina' }).click();
    await page.getByRole('region', { name: '¿Acertaste?' }).getByRole('textbox').fill('Pensé que se enfermaba, pero tenía una espina');
    await page.getByRole('button', { name: 'Terminar mi lectura' }).click();
    await expect(page.getByRole('heading', { name: '¡Lectura terminada!' })).toBeVisible();

    // RF-056, RF-058: los puntos de esta visita (defensa + lectura completada) y la insignia nueva, al instante.
    const despues = await puntosGuardados(id);
    expect(despues - antes).toBeGreaterThanOrEqual(30);
    const logros = page.getByRole('region', { name: `¡Ganaste ${despues - antes} puntos!` });
    await expect(logros).toBeVisible();
    await expect(logros.getByRole('list', { name: 'Insignias nuevas' })).toContainText('Nueva insignia: Primera lectura');

    // RF-059: el pasaporte refleja el estado real (insignias, avance, lecturas y puntos).
    await logros.getByRole('link', { name: 'Ver mi pasaporte' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pasaporte del Lector' })).toBeVisible();
    const insignias = page.getByRole('list', { name: 'Insignias' }).getByRole('listitem');
    await expect(insignias).toHaveCount(9);
    await expect(insignias.filter({ hasText: 'Primera lectura' })).toContainText('Ganada el');
    await expect(insignias.filter({ hasText: 'Detective de Evidencias' })).toContainText('1 de 5'); // UAT-03
    await expect(insignias.filter({ hasText: 'Lector Perseverante' })).toContainText('1 de 7');
    await expect(insignias.filter({ hasText: 'Rango Explorador' })).toContainText('Por ganar');
    await expect(page.getByRole('list', { name: 'Lecturas terminadas' })).toContainText(killa.titulo);
    await expect(page.getByRole('list', { name: 'Mundos completados' })).toContainText('Explorador'); // RF-033: el reto inicial lo ubicó en el Detective
    await expect(numeros(page)).toContainText(`${despues} puntos`);
    await expect(page.getByRole('list', { name: 'Últimos puntos' }).getByRole('listitem').first()).toContainText('Lectura terminada');
  });

  test('el inicio muestra su marcador y el reto del día; en la tienda canjea con monedas sin perder puntos (RF-060, RF-062)', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Sami', avatar: 'panda' }]);
    await retoTerminado(request, aula, 'Sami', ['LIT', 'VOC']);
    const nino = await sesionDelNino(request, aula, 'Sami');
    // RF-060: con 0 en inferencias tras su reto inicial, el reto del día es para esa habilidad.
    const reto = await (await request.get('/api/v1/yo/reto-del-dia', { headers: nino })).json();
    expect(reto).toMatchObject({ habilidad: 'INF', meta: 3, avance: 0, estado: 'PROPUESTO' });
    const killa = await lecturaKilla(request);
    await leerPorApi(request, aula, 'Sami', killa.lecturaId, { nino, terminar: true });
    const id = aula.estudiantes['Sami'] as string;
    const puntos = await puntosGuardados(id);
    const monedas = Math.floor(puntos / 10);
    expect(monedas).toBeGreaterThanOrEqual(5);

    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Sami');
    const marcador = page.getByRole('list', { name: 'Tu marcador' });
    await expect(marcador).toContainText('Nivel 0');
    await expect(marcador).toContainText('1 día seguido');
    await expect(marcador).toContainText(`${monedas} monedas`);
    const retoDelDia = page.getByRole('region', { name: 'Reto del día' });
    await expect(retoDelDia).toContainText('Responde bien 3 preguntas para descubrir lo que no se dice');
    await expect(retoDelDia).toContainText('1 de 3'); // la pregunta de inferencia de la lectura
    await expect(retoDelDia.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');

    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Pasaporte' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pasaporte del Lector' })).toBeVisible();
    const tienda = page.getByRole('list', { name: 'Recompensas' });
    await expect(tienda.getByRole('listitem')).toHaveCount(10);
    await expect(tienda.getByRole('button', { name: 'Canjear Dragón lector por 60 monedas' })).toBeDisabled();
    await tienda.getByRole('button', { name: 'Canjear Lupa de detective por 5 monedas' }).click();
    await expect(page.getByText('¡Lupa de detective: ya es tuya!')).toBeVisible();
    await expect(tienda.getByRole('listitem').filter({ hasText: 'Lupa de detective' })).toContainText('¡Es tuya!');
    // RF-062: descuenta monedas, nunca puntos de nivel.
    await expect(numeros(page)).toContainText(`🪙 ${monedas - 5}`);
    await expect(numeros(page)).toContainText(`${puntos} puntos`);
    expect(await puntosGuardados(id)).toBe(puntos);
  });
});
