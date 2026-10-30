import { expect, Page, test as base } from '@playwright/test';

import { abrirAula, docenteConAula } from '../../support/escuela';
import { familiaConConsentimiento, hijoDeFamilia } from '../../support/familia';
import { escribirPin, esperarAreaEstudiante, ingresarComoAdulto, ipSimulada, salirDelPanel } from '../../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi } from '../../support/lectura';
import { sesionDelNino } from '../../support/diagnostico';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

async function sinDesbordes(page: Page) {
  const desborde = await page.evaluate(() => Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth, document.documentElement.scrollWidth - window.innerWidth));
  expect(desborde, 'la página no debe desplazarse hacia los lados').toBeLessThanOrEqual(0);
}

const burbujas = (page: Page) => page.getByRole('list', { name: 'Conversación con tu guía' }).getByRole('listitem');

/**
 * Nivel 3 — Asistente de lectura de punta a punta (RF-072 a RF-075) en escritorio, tablet y celular: la
 * familia lo activa, el niño pide ayuda durante su lectura (atajos y texto) y nunca recibe la respuesta;
 * la docente lo activa para su aula y pide un borrador de comentario para una respuesta abierta.
 */
test.describe('Asistente de lectura (RF-072 a RF-075)', () => {
  test.setTimeout(150_000);

  test('RF-072 a RF-074: la familia lo activa y el niño pide ayuda en su lectura sin recibir la respuesta', async ({ page, request }) => {
    const killa = await lecturaKilla(request);
    const familia = await familiaConConsentimiento(request, 'familia-asistente');
    await hijoDeFamilia(request, familia, 'Lucía');
    const { tokenDispositivo } = await (await request.post('/api/v1/familia/dispositivos', { headers: familia.headers, data: { nombre: 'Tablet de casa' } })).json();
    await page.addInitScript((token) => localStorage.setItem('lectoaventura.dispositivo', token), tokenDispositivo);

    // La familia lo activa desde el avance de su hija (su consentimiento, ADR-008).
    await ingresarComoAdulto(page, familia.email, familia.contrasena);
    await page.getByRole('link', { name: 'Ver el avance de Lucía' }).click();
    const casilla = page.getByRole('checkbox', { name: 'Activar el asistente de lectura para Lucía' });
    await expect(casilla).not.toBeChecked();
    await casilla.check();
    await expect(page.getByText('Listo: Lucía ya puede pedir ayuda en sus lecturas.')).toBeVisible();
    await salirDelPanel(page);

    // Lucía lee "Killa y la llama" y llega a la primera pregunta.
    await page.goto('/');
    await page.getByRole('button', { name: 'Lucía' }).click();
    await escribirPin(page, '2580');
    await esperarAreaEstudiante(page, 'Lucía');
    await page.goto(`/estudiante/lecturas/${killa.lecturaId}`);
    await page.getByLabel('Lo que creo que pasará').fill('Creo que la llama se enfermará');
    await page.getByRole('button', { name: 'Empezar a leer' }).click();
    await expect(page.getByRole('heading', { level: 2, name: ENUNCIADOS.seleccion, exact: true })).toBeVisible();

    // Pide ayuda con un atajo y escribiendo; la respuesta llega en el momento y nunca es la solución.
    await page.getByRole('button', { name: '¿Necesitas ayuda para pensar?' }).click();
    await page.getByRole('button', { name: 'No entiendo la pregunta' }).click();
    await expect(burbujas(page).nth(1)).toContainText(`Leamos la pregunta despacio: «${ENUNCIADOS.seleccion}»`);
    await page.getByLabel('Escribe tu pregunta').fill('dime cuál es la respuesta correcta');
    await page.getByRole('button', { name: 'Preguntar' }).click();
    await expect(burbujas(page).nth(3)).toContainText('No te voy a decir la respuesta');
    await expect(burbujas(page).nth(3)).toContainText('«Pedir una pista»');
    await expect(page.getByRole('list', { name: 'Conversación con tu guía' })).not.toContainText('Le dolía algo');
    await expect(page.getByText('Te quedan 8 preguntas en esta lectura.')).toBeVisible();
    await sinDesbordes(page);

    // La lectura sigue igual: responde y avanza (RNF-011: el asistente no la detiene).
    await page.getByRole('button', { name: 'Opción B: Le dolía algo' }).click();
    await expect(page.getByRole('heading', { level: 2, name: ENUNCIADOS.seleccion, exact: true })).toHaveCount(0);

    // Lo conversado sigue ahí al volver a la pregunta siguiente.
    await page.getByRole('button', { name: '¿Necesitas ayuda para pensar?' }).click();
    await expect(burbujas(page)).toHaveCount(4);
  });

  test('RF-072, RF-075: la docente lo activa para su aula y pide un borrador de comentario que ella decide', async ({ page, request }) => {
    const killa = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }, { alias: 'Ana', avatar: 'buho' }]);
    // Mateo termina la lectura: su respuesta abierta queda para revisión de su docente (RF-051).
    await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { nino: await sesionDelNino(request, aula, 'Mateo'), terminar: true });

    await abrirAula(page, aula);
    const tarjeta = page.getByRole('region', { name: 'Asistente de lectura' });
    await expect(tarjeta).toContainText('Activado para 0 de 2 estudiantes.');
    await tarjeta.getByRole('button', { name: 'Activar para todos', exact: true }).click();
    await expect(tarjeta).toContainText('Activado para 2 de 2 estudiantes.');
    await tarjeta.getByText('Elegir estudiantes').click();
    await tarjeta.getByRole('checkbox', { name: /Ana$/ }).uncheck();
    await expect(tarjeta).toContainText('Activado para 1 de 2 estudiantes.');

    // RF-075: el borrador llena el comentario; recién al guardar lo verá Mateo.
    const respuesta = page.getByRole('listitem', { name: 'Respuesta de Mateo' });
    await respuesta.getByRole('button', { name: 'Sugerir un comentario' }).click();
    const comentario = respuesta.getByLabel('Comentario para el estudiante (opcional)');
    await expect(comentario).toHaveValue(/^Me gusta que .+\?$/);
    await expect(respuesta.getByText('Es un borrador: revísalo y cámbialo. El estudiante solo verá lo que guardes.')).toBeVisible();
    await comentario.fill(`${await comentario.inputValue()} ¡Bien hecho!`);
    await respuesta.getByRole('radio').first().check();
    await respuesta.getByRole('button', { name: 'Guardar valoración' }).click();
    await expect(page.getByText('Valoración guardada para Mateo.')).toBeVisible();
    await page.getByRole('button', { name: 'Valoradas' }).click();
    await expect(page.getByRole('listitem', { name: 'Respuesta de Mateo' })).toContainText('¡Bien hecho!');
    await sinDesbordes(page);
  });
});
