import { expect, Page, test as base } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../../support/diagnostico';
import { abrirAula, docenteConAula, PIN_PRUEBA, sesionApi, tabletDelAulaActivada } from '../../support/escuela';
import { escribirPin, esperarAreaEstudiante, ipSimulada } from '../../support/iam';
import { lecturaKilla, leerPorApi } from '../../support/lectura';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/** Con CAPTURAS_DIR, guarda cómo se ve cada pantalla (para revisar el diseño en cada tamaño). */
async function captura(page: Page, nombre: string): Promise<void> {
  const dir = process.env.CAPTURAS_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${nombre}-${test.info().project.name}.png`, fullPage: true });
}

/**
 * Nivel 3 — Lo que se suma al Pasaporte del Lector: las recompensas se usan (el accesorio en el avatar),
 * la tienda filtra al tocar, las insignias dicen cómo se ganan, la Copa Lectora del aula ordena a los
 * compañeros por sus puntos de la semana y la docente envía mensajitos que el niño cierra con «¡Gracias!».
 */
test.describe('[Gamificacion][Menor][Slow] Copa Lectora, mensajitos de la docente y recompensas que se usan', () => {
  test.setTimeout(180_000);

  async function entrar(page: Page, alias: string) {
    await page.goto('/');
    await page.getByRole('button', { name: alias }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, alias);
  }

  test('el niño lee el mensajito de su profe, ve la Copa de su aula y se pone lo que canjeó', async ({ page, request }) => {
    const aula = await docenteConAula(request, [
      { alias: 'Sami', avatar: 'panda' },
      { alias: 'Leo', avatar: 'zorro' },
      { alias: 'Ana', avatar: 'rana' },
    ]);
    await retoTerminado(request, aula, 'Sami', ['LIT', 'VOC']);
    const killa = await lecturaKilla(request);
    await leerPorApi(request, aula, 'Sami', killa.lecturaId, { terminar: true });

    const docente = await sesionApi(request, aula.docente);
    const envio = await request.post(`/api/v1/aulas/${aula.aulaId}/mensajes`, {
      headers: docente,
      data: { sticker: 'ESTRELLA', texto: '¡Qué bien leyeron hoy, campeones!' },
    });
    expect(envio.status(), await envio.text()).toBe(201);
    expect(await envio.json()).toMatchObject({ para: 'Toda el aula', total: 3, leidos: 0 });

    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Sami');

    // El mensajito de su profe, arriba en el inicio.
    const mensajes = page.getByRole('region', { name: 'Mensajes de tu profe' });
    await expect(mensajes).toContainText('¡Qué bien leyeron hoy, campeones!');

    // La Copa Lectora: Sami ya leyó esta semana, así que va primero; sus compañeros, con 0.
    const copa = page.getByRole('region', { name: 'Copa Lectora' });
    await expect(copa).toContainText(aula.aula);
    await expect(copa).toContainText('¡Vas primero!');
    const podio = copa.getByRole('list', { name: 'Podio de la semana' }).getByRole('listitem');
    await expect(podio).toHaveCount(3);
    await expect(podio.first()).toHaveAccessibleName(/^Puesto 1: tú, \d+ puntos$/);
    await expect(podio.nth(1)).toHaveAccessibleName('Puesto 2: Ana, 0 puntos'); // empate: por alias
    await captura(page, 'inicio-nino');

    // «¡Gracias!» cierra el mensajito y la docente ve que lo leyó.
    await mensajes.getByRole('button', { name: '¡Gracias!' }).click();
    await expect(mensajes).toBeHidden();
    await expect
      .poll(async () => (await (await request.get(`/api/v1/aulas/${aula.aulaId}/mensajes`, { headers: docente })).json())[0]?.leidos)
      .toBe(1);

    // En la tienda canjea la lupa y se la pone: su avatar la luce.
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Pasaporte' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Pasaporte del Lector' })).toBeVisible();
    const tienda = page.getByRole('list', { name: 'Recompensas' });
    await tienda.getByRole('button', { name: 'Canjear Lupa de detective por 5 monedas' }).click();
    await expect(page.getByText('¡Lupa de detective: ya es tuya!')).toBeVisible();
    await tienda.getByRole('button', { name: 'Usar Lupa de detective' }).click();
    await expect(page.getByRole('img', { name: 'Tu avatar: Panda con la lupa de detective' })).toBeVisible();
    await expect(tienda.getByRole('listitem').filter({ hasText: 'Lupa de detective' })).toContainText('Lo llevas puesto');

    // Los filtros de la tienda funcionan al tocarlos.
    const filtros = page.getByRole('group', { name: 'Qué quieres ver' });
    await filtros.getByRole('button', { name: 'Personajes' }).click();
    await expect(tienda.getByRole('listitem')).toHaveCount(5);
    await filtros.getByRole('button', { name: 'Todo' }).click();
    await expect(tienda.getByRole('listitem')).toHaveCount(10);

    // Al tocar una insignia, dice cómo se gana.
    const detective = page.getByRole('region', { name: 'Tus insignias' }).getByRole('listitem').filter({ hasText: 'Detective de Evidencias' });
    await detective.getByRole('button').click();
    await expect(detective).toContainText('toca la oración del cuento que prueba tu respuesta');
    await captura(page, 'pasaporte');

    // De vuelta en el inicio, su avatar sigue con la lupa.
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Inicio' }).click();
    await expect(page.getByRole('img', { name: 'Tu avatar: Panda con la lupa de detective' })).toBeVisible();
  });

  test('la docente envía un mensajito a un estudiante con sticker y frase rápida, y ve si lo leyó', async ({ page, request }) => {
    const aula = await docenteConAula(request, [
      { alias: 'Leo', avatar: 'zorro' },
      { alias: 'Ana', avatar: 'rana' },
    ]);
    await abrirAula(page, aula);

    await expect(page.getByRole('heading', { level: 2, name: 'Mensajitos para tus estudiantes' })).toBeVisible();
    await page.getByLabel('¿Para quién?').selectOption({ label: 'Leo' });
    await page.getByRole('button', { name: 'Cohete' }).click();
    await page.getByRole('button', { name: '¡Sigue así, vas muy bien!' }).click();
    await expect(page.getByLabel('Tu mensajito')).toHaveValue('¡Sigue así, vas muy bien!');
    await page.getByRole('button', { name: 'Enviar mensajito' }).click();
    await expect(page.getByText('Enviaste tu mensajito a Leo.')).toBeVisible();
    const enviados = page.getByRole('list', { name: 'Mensajitos enviados' }).getByRole('listitem');
    await expect(enviados.first()).toContainText('Para Leo');
    await expect(enviados.first()).toContainText('Sin leer');
    await captura(page, 'docente-mensajitos');

    // Solo Leo lo recibe.
    const leo = await sesionDelNino(request, aula, 'Leo');
    const deLeo = await (await request.get('/api/v1/yo/mensajes', { headers: leo })).json();
    expect(deLeo).toEqual([expect.objectContaining({ sticker: 'COHETE', texto: '¡Sigue así, vas muy bien!', aula: aula.aula })]);
    const ana = await sesionDelNino(request, aula, 'Ana');
    expect(await (await request.get('/api/v1/yo/mensajes', { headers: ana })).json()).toEqual([]);
    // Ana no puede marcar el mensaje de Leo.
    expect((await request.post(`/api/v1/yo/mensajes/${deLeo[0].id}/leido`, { headers: ana })).status()).toBe(404);
  });
});
