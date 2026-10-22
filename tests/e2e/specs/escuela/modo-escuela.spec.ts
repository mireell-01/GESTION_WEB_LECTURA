import { expect, test as base } from '@playwright/test';

import {
  abrirAula,
  diaLima,
  docenteConAula,
  PIN_PRUEBA,
  pinesDeLaDescarga,
  sembrarCatalogoE2E,
  sesionApi,
  tabletDelAulaActivada,
} from '../../support/escuela';
import {
  cuentaVerificada,
  escribirPin,
  esperarAreaEstudiante,
  ingresarComoAdulto,
  ipSimulada,
  salirDelPanel,
} from '../../support/iam';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Modo escuela de punta a punta (RF-014 a RF-020) en escritorio, tablet y celular:
 * la docente usa la web real y los niños entran desde la tablet, como en el aula.
 */
test.describe('Modo escuela (RF-014 a RF-020)', () => {
  test('la docente crea su aula, matricula, descarga las tarjetas y el niño entra con el PIN impreso', async ({ page, request }) => {
    const docente = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Rosa Docente', prefijo: 'docente' });
    await ingresarComoAdulto(page, docente.email, docente.contrasena);
    await expect(page).toHaveURL(/\/docente$/);

    // RF-014: crear el aula con el consentimiento institucional.
    await page.getByRole('button', { name: '+ Nueva aula' }).click();
    await page.getByLabel('Nombre del aula').fill('3.° B');
    await page.getByLabel('Institución educativa').fill('IE 1234 Santa Rosa');
    await page.getByLabel('Autoridad que firmó el consentimiento').fill('Directora Ruiz');
    await expect(page.getByRole('button', { name: 'Crear aula' })).toBeDisabled();
    await page.getByRole('checkbox', { name: /Declaro que la institución/ }).check();
    await page.getByRole('button', { name: 'Crear aula' }).click();
    await expect(page.getByRole('heading', { level: 1, name: '3.° B' })).toBeVisible();

    // RF-015: uno por uno, sin apellidos, documento ni foto.
    await page.getByLabel('Alias del estudiante').fill('Mateo');
    await page.getByRole('button', { name: 'León', exact: true }).click();
    await page.getByRole('button', { name: 'Matricular', exact: true }).click();
    await expect(page.getByText(/Matriculados: Mateo/)).toBeVisible();

    // RF-016: CSV con una fila rechazada y su motivo.
    await page.getByRole('button', { name: 'Varios con CSV' }).click();
    await page.getByLabel('Contenido del CSV').fill('alias,año,mes,avatar\nAna,2017,3,buho\nRita,2017,13,panda');
    await page.getByRole('button', { name: 'Matricular desde el CSV' }).click();
    await expect(page.getByRole('cell', { name: 'Rita,2017,13,panda' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Estudiantes (2/45)' })).toBeVisible();

    // RF-017: el PDF trae un PIN por tarjeta; el PIN no aparece en pantalla.
    await page.getByRole('checkbox', { name: 'Elegir a todos' }).check();
    const [descarga] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Descargar tarjetas (2)' }).click(),
    ]);
    expect(descarga.suggestedFilename()).toBe('tarjetas-3-b.pdf');
    const [pinAna, pinMateo] = await pinesDeLaDescarga(descarga);
    expect(pinMateo).toMatch(/^\d{4}$/);
    await expect(page.getByText(/Tarjetas listas \(2\)/)).toBeVisible();
    await expect(page.getByText(pinMateo as string, { exact: true })).toHaveCount(0);

    // CR-01: la docente activa la tablet del aula y Mateo entra con el PIN de su tarjeta.
    await page.getByRole('link', { name: 'Mis aulas' }).first().click();
    await page.getByRole('button', { name: 'Activar esta tablet para 3.° B' }).click();
    await page.getByRole('button', { name: 'Dejar la tablet lista para los niños' }).click();
    await expect(page.getByRole('heading', { name: '¿Quién va a leer hoy?' })).toBeVisible();
    await page.getByRole('button', { name: 'Mateo' }).click();
    await escribirPin(page, pinMateo as string);
    await esperarAreaEstudiante(page, 'Mateo');
    expect(pinAna).toMatch(/^\d{4}$/);
  });

  test('la docente deja una lectura y el niño la ve en su inicio como "Misión del docente"', async ({ page, request }) => {
    const { lectura } = await sembrarCatalogoE2E();
    const aula = await docenteConAula(request, [{ alias: 'Lucía', avatar: 'zorro' }]);

    await abrirAula(page, aula);
    await page.getByRole('button', { name: '+ Nueva asignación' }).click();
    await page.getByLabel('Lectura', { exact: true }).selectOption({ label: `${lectura} — 8–9 años · nivel 2` });
    await page.getByLabel('Fecha límite').fill(diaLima(7));
    await page.getByRole('button', { name: 'Asignar', exact: true }).click();
    const asignacion = page.getByRole('listitem').filter({ hasText: lectura });
    await expect(asignacion.getByText('En curso')).toBeVisible();
    await expect(asignacion.getByText('Toda el aula')).toBeVisible();
    await salirDelPanel(page);

    await tabletDelAulaActivada(page, request, aula);
    await page.goto('/');
    await page.getByRole('button', { name: 'Lucía' }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, 'Lucía');
    const misiones = page.getByRole('region', { name: 'Misiones de tu profe' });
    await expect(misiones.getByText('Misión del docente')).toBeVisible();
    await expect(misiones.getByText(lectura)).toBeVisible();
  });

  test('la familia se vincula con el código de la docente y el niño entra desde la tablet de casa', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await abrirAula(page, aula);

    // RF-019: el código se ve una sola vez, listo para anotarlo.
    await page.getByRole('button', { name: 'Invitar a la familia de Mateo' }).click();
    const caja = page.getByRole('region', { name: 'Código de invitación para la familia de Mateo' });
    const codigo = (await caja.locator('.invitacion__codigo').innerText()).trim();
    expect(codigo).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await salirDelPanel(page);

    const familia = await cuentaVerificada(request, { prefijo: 'familia', nombre: 'Carmen Familia' });
    await ingresarComoAdulto(page, familia.email, familia.contrasena);
    await expect(page).toHaveURL(/\/familia$/);
    await page.getByLabel('Código de la docente').fill(codigo.toLowerCase());
    await page.getByRole('button', { name: 'Usar el código' }).click();
    await expect(page.getByText('¡Listo! Ahora acompañas a Mateo (3.° B) desde tu cuenta.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Desde su aula (1)' })).toBeVisible();

    // El mismo código ya no sirve (un solo uso).
    await page.getByLabel('Código de la docente').fill(codigo);
    await page.getByRole('button', { name: 'Usar el código' }).click();
    await expect(page.getByText(/no es válido o ya venció/)).toBeVisible();

    // RN-04: vinculada la tablet de casa, Mateo entra con su PIN.
    await page.getByRole('button', { name: 'Vincular este dispositivo' }).click();
    await expect(page.getByText('Este dispositivo está vinculado por 30 días')).toBeVisible();
    await salirDelPanel(page);
    await page.goto('/ingresar/estudiante');
    await page.getByRole('button', { name: 'Mateo' }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, 'Mateo');

    // La docente ve que su familia ya está vinculada.
    const detalle = await request.get(`/api/v1/aulas/${aula.aulaId}`, { headers: await sesionApi(request, aula.docente) });
    expect((await detalle.json()).estudiantes[0].familiaresVinculados).toBe(1);
  });

  test('al cierre del año la docente archiva el aula y queda solo para consultar', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Ana', avatar: 'buho' }]);
    await abrirAula(page, aula);

    await page.getByRole('button', { name: 'Archivar aula' }).click();
    await page.getByRole('button', { name: 'Sí, archivar 3.° B' }).click();
    await expect(page.getByText('Esta aula está archivada: puedes consultarla, pero ya no se modifica.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Matricular estudiantes' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Descargar tarjetas/ })).toHaveCount(0);
    // Ana sigue en la lista de estudiantes del aula (también aparece en el reto de repaso, Módulo 5).
    await expect(page.locator('.alumnos').getByText('Ana', { exact: true })).toBeVisible();

    await page.getByRole('link', { name: 'Mis aulas' }).first().click();
    await expect(page.getByRole('link', { name: 'Abrir 3.° B' }).getByText('Archivada')).toBeVisible();
  });
});
