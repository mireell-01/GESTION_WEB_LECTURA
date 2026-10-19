import { expect, Page, test as base } from '@playwright/test';

import { idMundo, misionConLecturas, simularDesbloqueo, tituloMision } from '../../support/aventura';
import { cuentaBackoffice, ingresarBackoffice, lecturaPublicada } from '../../support/contenido';
import { AulaPreparada, docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../../support/escuela';
import { escribirPin, esperarAreaEstudiante, ipSimulada, salirDelPanel } from '../../support/iam';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Aventura de punta a punta (RF-030 a RF-033) en escritorio, tablet y celular: la editora
 * arma misiones en la web real y el niño (9 años) las encuentra en su mapa; los mundos bloqueados no
 * se abren y un desbloqueo se celebra una sola vez.
 */
test.describe('Aventura: mapa, mundos y misiones (RF-030 a RF-033)', () => {
  test.setTimeout(150_000);

  async function entrarComoNino(page: Page, aula: AulaPreparada, alias: string) {
    await page.goto('/');
    await page.getByRole('button', { name: alias }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, alias);
  }

  test('la editora arma una misión en la web y el niño la ve en su mundo; los demás siguen bloqueados', async ({ page, request }) => {
    const sufijo = Date.now().toString(36);
    const lectura = await lecturaPublicada(request, { titulo: `La cueva del eco ${sufijo}`, tematica: `Cuevas ${sufijo}` });
    const editora = await cuentaBackoffice('EDITOR');
    const titulo = tituloMision('Huellas en el bosque');

    // RF-032: la editora elige el mundo y la edad, y arma la misión con lecturas publicadas de esa edad.
    await ingresarBackoffice(page, editora);
    await page.getByRole('link', { name: 'Armar las misiones' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Misiones' })).toBeVisible();
    await page.getByLabel('Mundo', { exact: true }).selectOption({ label: 'Mundo 1 · Explorador' });
    await page.getByLabel('Edad', { exact: true }).selectOption('R2');
    await page.getByRole('button', { name: '+ Nueva misión' }).click();
    await page.getByLabel('Título de la misión').fill(titulo);
    await page.getByLabel('Descripción (opcional)').fill('Sigue las huellas hasta la cueva.');
    await page.getByRole('button', { name: `Agregar ${lectura.titulo}` }).click();
    await expect(page.getByRole('button', { name: `Quitar ${lectura.titulo}` })).toBeVisible();
    await page.getByRole('button', { name: 'Crear misión' }).click();
    await expect(page.getByText('Misión creada.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: titulo })).toBeVisible();
    await salirDelPanel(page);

    // RF-030, RF-033: un niño nuevo (sin el Módulo 5 todavía) empieza en el Explorador.
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]); // nacido en 2017: 8–9 años
    await tabletDelAulaActivada(page, request, aula);
    await entrarComoNino(page, aula, 'Mateo');
    const mundos = page.getByRole('region', { name: 'Tus mundos' });
    await expect(mundos.getByRole('link', { name: 'Entrar al mundo 1: Explorador' })).toContainText('¡Estás aquí!');
    await expect(mundos.getByRole('link', { name: /Entrar al mundo [2-5]/ })).toHaveCount(0);
    await expect(mundos.getByText('Completa el mundo anterior')).toHaveCount(4);

    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
    await page.getByRole('link', { name: 'Entrar al mundo 1: Explorador' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Explorador' })).toBeVisible();
    const mision = page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name: titulo }) });
    await expect(mision.getByText('Por empezar')).toBeVisible();
    await expect(mision.getByText('Sigue las huellas hasta la cueva.')).toBeVisible();
    await expect(mision.getByText(lectura.titulo)).toBeVisible();
    await expect(mision.getByText('Por leer')).toBeVisible();
  });

  test('un mundo bloqueado no se abre aunque el niño escriba su dirección', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Lía', avatar: 'koala' }]);
    await tabletDelAulaActivada(page, request, aula);
    await entrarComoNino(page, aula, 'Lía');
    await page.goto(`/estudiante/mundos/${await idMundo(3)}`);
    await expect(page.getByText('Este mundo todavía está bloqueado: completa el anterior para abrirlo')).toBeVisible();
    await page.getByRole('link', { name: 'Tu mapa' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
  });

  test('RF-031: al desbloquear el Detective el niño ve la celebración una sola vez', async ({ page, request }) => {
    const editora = await cuentaBackoffice('EDITOR');
    const delDetective = await misionConLecturas(request, editora, 2, tituloMision('El enigma del valle'), ['Pistas en la arena']);
    const aula = await docenteConAula(request, [{ alias: 'Teo', avatar: 'panda' }]);
    await tabletDelAulaActivada(page, request, aula);
    await entrarComoNino(page, aula, 'Teo');
    await expect(page.getByRole('link', { name: 'Entrar al mundo 1: Explorador' })).toBeVisible(); // ya tiene su mapa

    await simularDesbloqueo(aula.estudiantes['Teo'] as string, 2);
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
    const celebracion = page.getByRole('dialog', { name: '¡Desbloqueaste el mundo Detective!' });
    await expect(celebracion).toBeVisible();
    await expect(celebracion.getByRole('button', { name: '¡Vamos!' })).toBeFocused();
    const vista = page.waitForResponse((r) => r.url().endsWith('/celebracion') && r.status() === 204);
    await celebracion.getByRole('button', { name: '¡Vamos!' }).click();
    await vista;
    await expect(celebracion).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Entrar al mundo 1: Explorador' })).toContainText('¡Mundo completado!');

    // No se repite: la API la marcó como vista.
    await page.reload();
    await expect(page.getByRole('link', { name: 'Entrar al mundo 2: Detective' })).toContainText('¡Estás aquí!');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('link', { name: 'Entrar al mundo 2: Detective' }).click();
    await expect(page.getByRole('heading', { level: 2, name: delDetective.titulo })).toBeVisible();
  });

  test('el revisor consulta las misiones pero no las cambia', async ({ page }) => {
    const revisor = await cuentaBackoffice('REVISOR');
    await ingresarBackoffice(page, revisor);
    await page.getByRole('link', { name: 'Ver las misiones' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Misiones' })).toBeVisible();
    await expect(page.getByLabel('Mundo', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Nueva misión' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Editar / })).toHaveCount(0);
  });
});
