import { readFileSync } from 'node:fs';

import { APIRequestContext, Download, expect, Page } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../support/diagnostico';
import { abrirAula, AulaPreparada, docenteConAula } from '../support/escuela';
import { cuentaVerificada, ingresarComoAdulto } from '../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../support/lectura';
import { destinatariosDeAsignaciones, refrescarVistas, sembrarMaestria, sembrarMaestrias, sinActividadDesde } from '../support/seguimiento';
import { Cuando, Dado, Entonces, Mundo } from './fixtures';

/** Nivel 4 — Pasos de los escenarios del seguimiento docente (RF-063 a RF-067, RN-17, UAT-04). */

const NOMBRES = [
  'Mateo', 'Valeria', 'Thiago', 'Camila', 'Santiago', 'Luciana', 'Sebastián', 'Mía', 'Matías', 'Isabella',
  'Gael', 'Ximena', 'Dylan', 'Antonella', 'Joaquín', 'Renata', 'Adrián', 'Fernanda', 'Liam', 'Abril',
  'Bruno', 'Daniela', 'Emilio', 'Alessia', 'Fabián', 'Romina', 'Iker', 'Zoe', 'Nicolás', 'Kiara',
  'Leonardo', 'Micaela', 'Rodrigo', 'Paola', 'Diego', 'Andrea', 'Gabriel', 'Valentina', 'Samuel', 'Julia',
];
const AVATARES = ['zorro', 'panda', 'leon', 'rana', 'pulpo', 'buho', 'tortuga', 'unicornio', 'abeja', 'delfin', 'tigre', 'koala'];

/** Un aula de 3.er grado con `n` estudiantes (n ≤ 40), cada uno con un avatar. */
function aulaDe(request: APIRequestContext, n: number): Promise<AulaPreparada> {
  return docenteConAula(request, NOMBRES.slice(0, n).map((alias, i) => ({ alias, avatar: AVATARES[i % AVATARES.length] as string })));
}

const id = (mundo: Mundo, alias: string) => mundo.aula!.estudiantes[alias] as string;
const filas = (page: Page) => page.getByRole('region', { name: 'Mapa de calor por habilidad' }).getByRole('table').getByRole('row');
const alertas = (page: Page) => page.getByRole('list', { name: 'Alertas' }).getByRole('listitem');

// ── Preparación ──────────────────────────────────────────────────────────────

Dado('un aula de 3.er grado con 30 estudiantes y actividad en las últimas 2 semanas', async ({ request, mundo }) => {
  mundo.aula = await aulaDe(request, 30);
  // Mateo lee de verdad: falla la inferencia hasta la explicación y elige su evidencia.
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']);
  const killa = await lecturaKilla(request);
  await leerPorApi(request, mundo.aula, 'Mateo', killa.lecturaId, { nino: await sesionDelNino(request, mundo.aula, 'Mateo'), terminar: true, fallar: [ENUNCIADOS.seleccion] });
  // Los demás, con la maestría que Progreso midió en sus lecturas: inferencias entre 60 y 88.
  await sembrarMaestrias(NOMBRES.slice(1, 30).map((alias, i) => ({ estudianteId: id(mundo, alias), valores: { INF: 60 + i } })));
  await refrescarVistas();
});

Dado('{int} estudiantes tienen inferencias en nivel {string}', async ({ mundo }, cuantos: number, nivel: string) => {
  expect(nivel).toBe('C');
  // De 14 a 36: en inicio (nivel C es menos de 40).
  await sembrarMaestrias(NOMBRES.slice(1, 1 + cuantos).map((alias, i) => ({ estudianteId: id(mundo, alias), valores: { INF: 36 - i * 2 } })));
  await refrescarVistas();
});

Dado('un aula donde {string} tiene inferencias y argumentación en inicio y {string} no lee hace {int} días', async ({ request, mundo }, enInicio: string, inactivo: string, dias: number) => {
  mundo.aula = await docenteConAula(request, [
    { alias: enInicio, avatar: 'unicornio' },
    { alias: inactivo, avatar: 'panda' },
    { alias: 'Ana', avatar: 'buho' },
  ]);
  await sembrarMaestria(id(mundo, enInicio), { INF: 20, ARG: 30 });
  // Hizo su reto inicial y luego dejó de leer.
  await retoTerminado(request, mundo.aula, inactivo, ['LIT', 'INF', 'VOC', 'CRI', 'ARG']);
  await sembrarMaestria(id(mundo, inactivo), {});
  await sinActividadDesde(id(mundo, inactivo), dias);
  await sembrarMaestria(id(mundo, 'Ana'), { INF: 90, LIT: 88 }, 8);
  await refrescarVistas();
});

Dado('un aula donde 2 de sus 4 estudiantes tienen inferencias en inicio', async ({ request, mundo }) => {
  mundo.aula = await docenteConAula(request, [
    { alias: 'Mateo', avatar: 'leon' },
    { alias: 'Sofía', avatar: 'unicornio' },
    { alias: 'Teo', avatar: 'panda' },
    { alias: 'Ana', avatar: 'buho' },
  ]);
  // La lectura de ejemplo trabaja inferencias: es la que el panel puede sugerir.
  mundo.killa = await lecturaKilla(request);
  await sembrarMaestrias([
    { estudianteId: id(mundo, 'Mateo'), valores: { INF: 80 } },
    { estudianteId: id(mundo, 'Sofía'), valores: { INF: 20 } },
    { estudianteId: id(mundo, 'Teo'), valores: { INF: 25 } },
    { estudianteId: id(mundo, 'Ana'), valores: { INF: 90 } },
  ]);
  await refrescarVistas();
});

Dado('un aula de 3.er grado con {int} estudiantes', async ({ request, mundo }, n: number) => {
  mundo.aula = await aulaDe(request, n);
  await sembrarMaestrias(NOMBRES.slice(0, n).map((alias, i) => ({ estudianteId: id(mundo, alias), valores: { LIT: 30 + i, INF: 25 + i, VOC: 50 + i } })));
  await refrescarVistas();
});

// ── Acciones ─────────────────────────────────────────────────────────────────

Cuando('la docente abre el panel del aula', async ({ page, mundo }) => {
  await abrirAula(page, mundo.aula!);
  const panel = page.waitForResponse((r) => r.url().endsWith(`/api/v1/aulas/${mundo.aula!.aulaId}/panel`));
  await page.getByRole('link', { name: 'Ver seguimiento' }).click();
  const respuesta = await panel;
  expect(respuesta.ok()).toBe(true);
  mundo.panelMs = respuesta.request().timing().responseEnd;
  await expect(page.getByRole('heading', { level: 1, name: 'Seguimiento del aula' })).toBeVisible();
});

Cuando('asigna con un clic la lectura sugerida para reforzar inferencias', async ({ page }) => {
  const refuerzo = page.getByRole('list', { name: 'Refuerzos sugeridos' }).getByRole('listitem').filter({ hasText: 'Inferencias' });
  await expect(refuerzo).toContainText('Inferencias: 50 % del aula en inicio');
  await refuerzo.getByRole('button', { name: /^Asignar «.+» a 2 estudiantes para reforzar inferencias$/ }).click();
  await expect(refuerzo.getByText(/quedó asignada a 2 estudiantes hasta el/)).toBeVisible();
});

Cuando('otra docente intenta abrir el seguimiento de esa aula', async ({ page, request, mundo }) => {
  const otra = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Marta Docente', prefijo: 'otra-docente' });
  await ingresarComoAdulto(page, otra.email, otra.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
  await page.goto(`/docente/aulas/${mundo.aula!.aulaId}/seguimiento`);
});

// ── Resultados ───────────────────────────────────────────────────────────────

Entonces('ve un mapa de calor de estudiantes por habilidad en menos de 1,5 segundos', async ({ page, mundo }) => {
  // RNF-003 / RF-063: el panel del aula responde en menos de 1,5 s.
  expect(mundo.panelMs).toBeLessThan(1500);
  await expect(filas(page)).toHaveCount(31); // cabecera + 30
  await expect(filas(page).first().getByRole('columnheader')).toHaveCount(8); // estudiante, 5 habilidades, última actividad y lecturas de la semana
  await expect(filas(page).filter({ hasText: 'Valeria' }).getByRole('cell', { name: 'Inferencias: En inicio (36)' })).toBeVisible();
});

Entonces('puede filtrar a los {int} estudiantes con inferencias en nivel {string}', async ({ page }, cuantos: number, nivel: string) => {
  await page.getByRole('combobox', { name: 'Habilidad' }).selectOption('INF');
  await page.getByRole('combobox', { name: 'Nivel' }).selectOption(nivel);
  await expect(page.getByText(`${cuantos} de 30 estudiantes, de menor a mayor en inferencias`)).toBeVisible();
  await expect(filas(page)).toHaveCount(cuantos + 1);
  // De menor a mayor: primero quien tiene 14, al final quien tiene 36.
  await expect(filas(page).nth(1).getByRole('cell', { name: 'Inferencias: En inicio (14)' })).toBeVisible();
  await expect(filas(page).nth(cuantos).getByRole('cell', { name: 'Inferencias: En inicio (36)' })).toBeVisible();
});

Entonces('al abrir a un estudiante ve sus evidencias seleccionadas y las pistas que usó', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Habilidad' }).selectOption('');
  await page.getByRole('combobox', { name: 'Nivel' }).selectOption('');
  await filas(page).filter({ hasText: 'Mateo' }).getByRole('link', { name: 'Mateo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Mateo' })).toBeVisible();
  const sesion = page.getByRole('list', { name: 'Sesiones' }).getByRole('listitem').first();
  await expect(sesion).toContainText('Terminada');
  const respuestas = sesion.getByRole('list', { name: /^Respuestas de / });
  await expect(respuestas).toContainText('Evidencia elegida: «Killa vio que tenía una espina en la pata.»');
  const inferencia = respuestas.getByRole('listitem').filter({ hasText: ENUNCIADOS.seleccion }).first();
  await expect(inferencia.getByRole('list', { name: 'Pistas usadas' })).toContainText('P1: Vuelve a la oración que acabas de leer.');
});

Entonces('ve a {string} para acompañar por {string}', async ({ page }, alias: string, motivo: string) => {
  await expect(alertas(page).filter({ hasText: alias })).toContainText(motivo);
});

Entonces('la lectura queda asignada solo a esos 2 estudiantes', async ({ mundo }) => {
  expect(await destinatariosDeAsignaciones(mundo.aula!.aulaId)).toEqual([id(mundo, 'Sofía'), id(mundo, 'Teo')].sort());
});

/** RF-067: la descarga completa (hasta tener el archivo) en menos de 30 s. */
async function descargar(page: Page, boton: string): Promise<Download> {
  const inicio = Date.now();
  const [descarga] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: boton }).click()]);
  await descarga.path();
  expect(Date.now() - inicio).toBeLessThan(30_000);
  return descarga;
}

Entonces('descarga el reporte en CSV en menos de 30 segundos con una fila por estudiante', async ({ page, mundo }) => {
  const csv = await descargar(page, 'Descargar CSV');
  expect(csv.suggestedFilename()).toMatch(/^reporte-3-b-\d{4}-\d{2}-\d{2}\.csv$/);
  const lineas = readFileSync((await csv.path()) as string, 'utf8').slice(1).trim().split('\r\n');
  const n = Object.keys(mundo.aula!.estudiantes).length;
  expect(lineas).toHaveLength(n + 1); // cabecera + un estudiante por fila
  for (const alias of Object.keys(mundo.aula!.estudiantes)) expect(lineas.some((l) => l.startsWith(`${alias},`))).toBe(true);
});

Entonces('descarga el reporte en PDF en menos de 30 segundos', async ({ page }) => {
  const pdf = await descargar(page, 'Descargar PDF');
  expect(pdf.suggestedFilename()).toMatch(/^reporte-3-b-.*\.pdf$/);
  expect(readFileSync((await pdf.path()) as string).subarray(0, 5).toString()).toBe('%PDF-');
});

Entonces('ve {string} y ningún dato de sus estudiantes', async ({ page, mundo }, mensaje: string) => {
  await expect(page.getByText(mensaje)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  for (const alias of Object.keys(mundo.aula!.estudiantes).slice(0, 5)) await expect(page.getByText(alias, { exact: true })).toHaveCount(0);
});
