import { expect, Page, test as base } from '@playwright/test';

import { cuentaBackoffice, filtrarPorTema, ingresarBackoffice, lecturaPublicada } from '../../support/contenido';
import { docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../../support/escuela';
import { cuentaVerificada, escribirPin, esperarAreaEstudiante, ingresarComoAdulto, ipSimulada, salirDelPanel } from '../../support/iam';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/** PNG válido de 2×2 px (con su CRC y zlib correctos): el navegador lo convierte a WebP antes de subirlo (RF-023). */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP438MgZ1MBwv97GAAibgS7vSRLaQAAAABJRU5ErkJggg==', 'base64');

/**
 * Nivel 3 — Biblioteca y contenido de punta a punta (RF-021 a RF-028) en escritorio, tablet y
 * celular: la editora escribe en la web real, el revisor la devuelve y la publica, y la lectura
 * llega a la biblioteca de docentes, familias y niños.
 */
test.describe('Biblioteca y gestión de contenido (RF-021 a RF-028)', () => {
  test.setTimeout(150_000);

  async function abrirLectura(page: Page, titulo: string) {
    await page.getByRole('link', { name: 'Lecturas', exact: true }).first().click();
    await page.getByRole('link', { name: `Abrir ${titulo}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
  }

  test('la editora escribe y envía; el revisor la devuelve, luego la publica y llega a la biblioteca', async ({ page, request }) => {
    const editora = await cuentaBackoffice('EDITOR');
    const revisor = await cuentaBackoffice('REVISOR');
    const sufijo = Date.now().toString(36);
    const titulo = `El zorro curioso ${sufijo}`;

    // RF-021, RF-022: crear el borrador; el texto se divide solo en oraciones.
    await ingresarBackoffice(page, editora);
    await page.getByRole('link', { name: 'Escribir y editar lecturas' }).click();
    await page.getByRole('link', { name: '+ Nueva lectura' }).click();
    await page.getByLabel('Título').fill(titulo);
    await page.getByLabel('Temática').fill(`Animales ${sufijo}`);
    await page.getByRole('checkbox', { name: 'Inferencia' }).check();
    await page.getByLabel('Licencia').fill('CC BY 4.0');
    await page.getByLabel('Texto de la lectura').fill('Había una vez un zorro curioso. Quería tocar la luna.\nSubió al cerro. Pero la luna seguía lejos.');
    await page.getByRole('button', { name: 'Crear borrador' }).click();
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Oraciones (4)' })).toBeVisible();
    await expect(page.getByText('Agrega al menos una actividad para después de leer')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeDisabled();

    // RF-023: la imagen se convierte a WebP en el navegador; sin descripción no se puede subir.
    await page.getByLabel('Descripción de la imagen (texto alternativo)').fill('Un zorro mira la luna llena');
    await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'zorro.png', mimeType: 'image/png', buffer: PNG });
    await expect(page.getByText(/Imagen subida/)).toBeVisible();
    await expect(page.getByRole('img', { name: 'Un zorro mira la luna llena' })).toBeVisible();

    // RF-024, RF-025: una actividad "después" de selección, con P1 y explicación.
    await page.getByRole('button', { name: '+ Actividad después de leer' }).click();
    const actividad = page.getByRole('region', { name: 'Después de leer' }).getByRole('article');
    await actividad.getByLabel('Enunciado').fill('¿Qué quería el zorro?');
    await actividad.getByLabel('Opción 1', { exact: true }).fill('Tocar la luna');
    await actividad.getByLabel('Opción 2', { exact: true }).fill('Dormir');
    await actividad.getByLabel('P1 — dónde buscar en el texto').fill('Relee el primer párrafo.');
    await actividad.getByLabel('Explicación modelada').fill('El texto dice que quería tocar la luna.');
    await page.getByRole('button', { name: 'Guardar actividades' }).click();
    await expect(page.getByText('Actividades guardadas.')).toBeVisible();
    await expect(page.getByText('Está completa: ya se puede enviar a revisión.')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar a revisión' }).click();
    await expect(page.locator('.cabecera-aula').getByText('En revisión')).toBeVisible();
    await salirDelPanel(page);

    // RF-026: el revisor la devuelve con comentarios.
    await ingresarBackoffice(page, revisor);
    await abrirLectura(page, titulo);
    await page.getByRole('button', { name: 'Devolver con comentarios' }).click();
    await page.getByLabel('¿Qué hay que corregir?').fill('Agrega una pista P2 a la pregunta.');
    await page.getByRole('button', { name: 'Devolver a la autora' }).click();
    await expect(page.locator('.cabecera-aula').getByText('Borrador')).toBeVisible();
    await salirDelPanel(page);

    // La autora ve el motivo, corrige y la reenvía.
    await ingresarBackoffice(page, editora);
    await abrirLectura(page, titulo);
    await expect(page.getByText('El revisor la devolvió:')).toBeVisible();
    await expect(page.getByText('Agrega una pista P2 a la pregunta.')).toBeVisible();
    const pregunta = page.getByRole('region', { name: 'Después de leer' }).getByRole('article');
    await pregunta.getByLabel('P2 — qué párrafo mirar').fill('Mira qué quería hacer con la luna.');
    await page.getByRole('button', { name: 'Guardar actividades' }).click();
    await expect(page.getByText('Actividades guardadas.')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar a revisión' }).click();
    await expect(page.locator('.cabecera-aula').getByText('En revisión')).toBeVisible();
    await salirDelPanel(page);

    // El revisor la aprueba: queda publicada.
    await ingresarBackoffice(page, revisor);
    await abrirLectura(page, titulo);
    await expect(page.getByText('Correcta')).toBeVisible();
    await page.getByRole('button', { name: 'Aprobar y publicar' }).click();
    await expect(page.getByText('Publicada: está en la biblioteca y se puede asignar a las aulas.')).toBeVisible();
    await salirDelPanel(page);

    // RF-028: una docente la encuentra en la biblioteca y la abre (sin respuestas).
    const docente = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Rosa Docente', prefijo: 'docente' });
    await ingresarComoAdulto(page, docente.email, docente.contrasena);
    await page.getByRole('link', { name: 'Biblioteca' }).first().click();
    await filtrarPorTema(page, `animales ${sufijo}`);
    await page.getByRole('link', { name: `Abrir ${titulo}` }).click();
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await expect(page.getByText('Pero la luna seguía lejos.', { exact: false })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Un zorro mira la luna llena' })).toBeVisible();
    // Sin respuestas: ni la opción correcta, ni la pista, ni la explicación (el texto sí dice «tocar la luna»).
    await expect(page.getByText('Tocar la luna', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Relee el primer párrafo.')).toHaveCount(0);
    await expect(page.getByText('El texto dice que quería tocar la luna.')).toHaveCount(0);
  });

  test('el estudiante ve en su biblioteca solo lo de su edad y su nivel', async ({ page, request }) => {
    const sufijo = Date.now().toString(36);
    const tematica = `Cuentos ${sufijo}`;
    const paraEl = await lecturaPublicada(request, { titulo: `Cuento para 8–9 años ${sufijo}`, rangoEdad: 'R2', nivelDificultad: 2, tematica });
    const otra = await lecturaPublicada(request, { titulo: `Cuento para 10–12 años ${sufijo}`, rangoEdad: 'R3', nivelDificultad: 4, tematica });

    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]); // nacido en 2017: 8–9 años
    await tabletDelAulaActivada(page, request, aula);
    await page.goto('/');
    await page.getByRole('button', { name: 'Mateo' }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, 'Mateo');

    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Biblioteca' }).click();
    await expect(page.getByRole('heading', { name: 'Tu biblioteca' })).toBeVisible();
    await filtrarPorTema(page, tematica);
    await expect(page.getByRole('link', { name: `Abrir ${paraEl.titulo}` })).toBeVisible();
    await expect(page.getByRole('link', { name: `Abrir ${otra.titulo}` })).toHaveCount(0);
    await page.getByRole('link', { name: `Abrir ${paraEl.titulo}` }).click();
    // El resumen de la ficha repite el comienzo del texto: se espera el detalle y se busca dentro de él.
    const lectura = page.getByRole('article');
    await expect(lectura.getByRole('heading', { level: 1, name: paraEl.titulo })).toBeVisible();
    await expect(lectura.getByText('Había una vez un zorro que miraba la luna cada noche.', { exact: false })).toBeVisible();
    // Módulo 6: desde el detalle ya se lee la lectura con sus actividades.
    await expect(page.getByRole('link', { name: '¡Leer ahora!' })).toHaveAttribute('href', `/estudiante/lecturas/${paraEl.lecturaId}`);
  });

  test('la lectura publicada aparece para asignar en el aula (Módulo 2)', async ({ page, request }) => {
    const { titulo } = await lecturaPublicada(request, { titulo: `Para asignar ${Date.now().toString(36)}` });
    const aula = await docenteConAula(request, [{ alias: 'Ana', avatar: 'buho' }]);
    await ingresarComoAdulto(page, aula.docente.email, aula.docente.contrasena);
    await page.getByRole('link', { name: 'Abrir 3.° B' }).click();
    await page.getByRole('button', { name: '+ Nueva asignación' }).click();
    await expect(page.getByLabel('Lectura', { exact: true }).locator('option', { hasText: titulo })).toHaveCount(1);
    await salirDelPanel(page);
  });
});
