import { readFileSync } from 'node:fs';

import { expect, Page, test as base } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../../support/diagnostico';
import { abrirAula, AulaPreparada, docenteConAula } from '../../support/escuela';
import { ipSimulada } from '../../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../../support/lectura';
import { destinatariosDeAsignaciones, refrescarVistas, sembrarMaestria } from '../../support/seguimiento';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Seguimiento docente de punta a punta (RF-063 a RF-067) en escritorio, tablet y celular: la
 * docente abre el seguimiento de su aula, filtra el mapa de calor, ve a quién acompañar, asigna el
 * refuerzo grupal con un clic, abre el detalle de un estudiante con sus evidencias y pistas, y descarga
 * el reporte en CSV y PDF.
 */
test.describe('Seguimiento docente (RF-063 a RF-067)', () => {
  test.setTimeout(150_000);

  /** Mateo lee de verdad (se equivoca en la inferencia hasta la explicación); a los demás, lo que mediría Progreso. */
  async function aulaConDatos(request: Parameters<typeof docenteConAula>[0]): Promise<AulaPreparada> {
    const aula = await docenteConAula(request, [
      { alias: 'Mateo', avatar: 'leon' },
      { alias: 'Sofía', avatar: 'unicornio' },
      { alias: 'Teo', avatar: 'panda' },
      { alias: 'Ana', avatar: 'buho' },
    ]);
    await retoTerminado(request, aula, 'Mateo', ['LIT', 'VOC']);
    const killa = await lecturaKilla(request);
    await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { nino: await sesionDelNino(request, aula, 'Mateo'), terminar: true, fallar: [ENUNCIADOS.seleccion] });
    await sembrarMaestria(aula.estudiantes['Sofía'] as string, { INF: 20, ARG: 30 });
    await sembrarMaestria(aula.estudiantes['Teo'] as string, { INF: 25 });
    await sembrarMaestria(aula.estudiantes['Ana'] as string, { INF: 90, LIT: 88 }, 8);
    await refrescarVistas();
    return aula;
  }

  async function abrirSeguimiento(page: Page, aula: AulaPreparada) {
    await abrirAula(page, aula);
    const panel = page.waitForResponse((r) => r.url().endsWith(`/api/v1/aulas/${aula.aulaId}/panel`));
    await page.getByRole('link', { name: 'Ver seguimiento' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Seguimiento del aula' })).toBeVisible();
    return panel;
  }

  const filas = (page: Page) => page.getByRole('region', { name: 'Mapa de calor por habilidad' }).getByRole('table').getByRole('row');

  test('mapa de calor con filtros, alertas, refuerzo con un clic y el detalle con evidencias y pistas', async ({ page, request }) => {
    const aula = await aulaConDatos(request);
    const respuesta = await abrirSeguimiento(page, aula);
    expect(respuesta.ok()).toBe(true);
    // RNF-003: el panel de aula responde en menos de 1,5 s.
    expect(respuesta.request().timing().responseEnd).toBeLessThan(1500);

    // RF-063: una fila por estudiante y su nivel CNEB en cada habilidad.
    await expect(filas(page)).toHaveCount(5); // cabecera + 4
    const sofia = filas(page).filter({ hasText: 'Sofía' });
    await expect(sofia.getByRole('cell', { name: 'Inferencias: En inicio (20)' })).toBeVisible();
    await expect(sofia.getByRole('cell', { name: 'Argumentación: En inicio (30)' })).toBeVisible();
    await expect(filas(page).filter({ hasText: 'Ana' }).getByRole('cell', { name: 'Inferencias: Destacado (90)' })).toBeVisible();

    // UAT-04: filtrar a quienes tienen inferencias en nivel C.
    await page.getByRole('combobox', { name: 'Habilidad' }).selectOption('INF');
    await page.getByRole('combobox', { name: 'Nivel' }).selectOption('C');
    await expect(page.getByText('2 de 4 estudiantes, de menor a mayor en inferencias')).toBeVisible();
    await expect(filas(page)).toHaveCount(3);
    await expect(filas(page).nth(1)).toContainText('Sofía');
    await expect(filas(page).nth(2)).toContainText('Teo');

    // RF-065: a quién acompañar.
    const alertas = page.getByRole('list', { name: 'Alertas' }).getByRole('listitem');
    await expect(alertas).toHaveCount(1);
    await expect(alertas.first()).toContainText('Sofía');
    await expect(alertas.first()).toContainText('2 habilidades en inicio: inferencias, argumentación');

    // RF-066: el 50 % del aula tiene inferencias en inicio; se asigna la lectura sugerida con un clic.
    const refuerzo = page.getByRole('list', { name: 'Refuerzos sugeridos' }).getByRole('listitem');
    await expect(refuerzo.first()).toContainText('Inferencias: 50 % del aula en inicio');
    await expect(refuerzo.first()).toContainText('Lectura sugerida:');
    await refuerzo.first().getByRole('button', { name: /^Asignar «.+» a 2 estudiantes para reforzar inferencias$/ }).click();
    await expect(refuerzo.first().getByText(/quedó asignada a 2 estudiantes hasta el/)).toBeVisible();
    expect(await destinatariosDeAsignaciones(aula.aulaId)).toEqual([aula.estudiantes['Sofía'], aula.estudiantes['Teo']].sort());

    // RF-064: el detalle de Mateo, con la evidencia que eligió y las pistas que usó.
    await page.getByRole('combobox', { name: 'Habilidad' }).selectOption('');
    await page.getByRole('combobox', { name: 'Nivel' }).selectOption('');
    await filas(page).filter({ hasText: 'Mateo' }).getByRole('link', { name: 'Mateo' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Habilidades' }).getByRole('listitem')).toHaveCount(5);
    const sesion = page.getByRole('list', { name: 'Sesiones' }).getByRole('listitem').first();
    await expect(sesion).toContainText('Terminada');
    const respuestas = sesion.getByRole('list', { name: /^Respuestas de / });
    const inferencia = respuestas.getByRole('listitem').filter({ hasText: ENUNCIADOS.seleccion }).first();
    await expect(inferencia).toContainText('Con la explicación');
    await expect(inferencia.getByRole('list', { name: 'Pistas usadas' })).toContainText('P1: Vuelve a la oración que acabas de leer.');
    await expect(inferencia.getByRole('list', { name: 'Pistas usadas' })).toContainText('Explicación:');
    await expect(respuestas).toContainText('Evidencia elegida: «Killa vio que tenía una espina en la pata.»');
  });

  test('RF-067: descarga el reporte del aula en CSV y PDF', async ({ page, request }) => {
    const aula = await aulaConDatos(request);
    await abrirSeguimiento(page, aula);
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar CSV' }).click()]);
    expect(csv.suggestedFilename()).toMatch(/^reporte-3-b-\d{4}-\d{2}-\d{2}\.csv$/);
    const texto = readFileSync((await csv.path()) as string, 'utf8');
    expect(texto.charCodeAt(0)).toBe(0xfeff);
    const lineas = texto.slice(1).trim().split('\r\n');
    expect(lineas).toHaveLength(5);
    expect(lineas.find((l) => l.startsWith('Sofía,'))).toContain('20,C (En inicio)');

    const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Descargar PDF' }).click()]);
    expect(pdf.suggestedFilename()).toMatch(/^reporte-3-b-.*\.pdf$/);
    expect(readFileSync((await pdf.path()) as string).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
