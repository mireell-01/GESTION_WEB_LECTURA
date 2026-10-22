import { expect, Page, test as base } from '@playwright/test';

import { claveDelEnunciado, retoTerminado } from '../../support/diagnostico';
import { abrirAula, docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../../support/escuela';
import { escribirPin, esperarAreaEstudiante, ipSimulada, salirDelPanel } from '../../support/iam';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Diagnóstico de punta a punta (RF-034 a RF-037, RN-05) en escritorio, tablet y celular:
 * el niño hace su reto inicial en la web real, lo pausa y lo retoma, y queda ubicado en su mundo; la
 * docente le asigna un reto de repaso y compara el avance por habilidad.
 */
test.describe('Diagnóstico: reto inicial y de repaso (RF-034 a RF-037)', () => {
  test.setTimeout(150_000);

  async function entrar(page: Page, alias: string) {
    await page.goto('/');
    await page.getByRole('button', { name: alias }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, alias);
  }

  /** Responde la pregunta en pantalla: la correcta en las habilidades indicadas y otra en las demás. */
  async function responder(page: Page, acertar: string[]) {
    const enunciado = page.getByRole('heading', { level: 3 });
    const texto = (await enunciado.textContent()) as string;
    const clave = await claveDelEnunciado(texto);
    const opcion = acertar.includes(clave.habilidad) ? clave.correcta : clave.incorrecta;
    await page.getByRole('button').filter({ has: page.getByText(opcion, { exact: true }) }).click();
    await expect(page.getByRole('heading', { level: 3, name: texto, exact: true })).toHaveCount(0); // llegó otra pregunta o el resultado
  }

  /** Responde hasta el final. Antes de cada vuelta espera la pregunta o el resultado, para no cortar mientras la página carga. */
  async function terminarReto(page: Page, acertar: string[]) {
    const pregunta = page.getByRole('heading', { level: 3 });
    const fin = page.getByRole('heading', { level: 1, name: '¡Reto completado!' });
    for (;;) {
      await expect(pregunta.or(fin)).toBeVisible();
      if (await fin.isVisible()) return;
      await responder(page, acertar);
    }
  }

  /** El contador del reto. Exacto: el inicio también dice «Vas en la pregunta 5 de 15». */
  const contador = (page: Page, n: number) => page.getByText(`Pregunta ${n} de 15`, { exact: true });

  test('el niño hace su reto, lo pausa, sigue donde quedó y con buen LIT y VOC empieza en el Detective', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]); // nacido en 2017: 8–9 años
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Mateo');

    // RN-05: el mapa espera al reto inicial.
    const reto = page.getByRole('region', { name: '¡Tu reto inicial te espera!' });
    await expect(reto).toContainText('Son 15 preguntas cortas');
    await expect(page.getByRole('region', { name: 'Tus mundos' })).toContainText('Primero, tu reto inicial');
    await reto.getByRole('link', { name: '¡Empezar mi reto!' }).click();

    // RF-034: una pregunta a la vez, con su lectura a la vista y sin decir si acertó.
    await expect(contador(page, 1)).toBeVisible();
    await expect(page.getByRole('article')).toContainText('Killa');
    for (let i = 0; i < 4; i++) await responder(page, ['LIT', 'VOC']);
    await expect(contador(page, 5)).toBeVisible();

    // RF-036: pausa y vuelve donde se quedó.
    await page.getByRole('button', { name: 'Pausar y seguir después' }).click();
    await expect(page.getByRole('region', { name: '¡Tu reto inicial te espera!' })).toContainText('Vas en la pregunta 5 de 15');
    await page.getByRole('link', { name: 'Continuar mi reto' }).click();
    await expect(contador(page, 5)).toBeVisible();
    await terminarReto(page, ['LIT', 'VOC']);

    // RF-035: lo que ya sabe hacer, en estrellas (sin notas).
    const habilidades = page.getByRole('list', { name: 'Lo que ya sabes hacer' });
    await expect(habilidades.getByRole('listitem')).toHaveCount(5);
    await expect(habilidades.getByRole('listitem').filter({ hasText: 'Encontrar lo que dice el texto' }).getByRole('img', { name: '3 de 3 estrellas' })).toBeVisible();
    await expect(habilidades.getByRole('listitem').filter({ hasText: 'Descubrir lo que no se dice' }).getByRole('img', { name: '0 de 3 estrellas' })).toBeVisible();

    // RF-033: con LIT y VOC ≥ 65 empieza en el Detective y el Explorador queda completado.
    await page.getByRole('link', { name: 'Ver mi mapa' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Entrar al mundo 2: Detective' })).toContainText('¡Estás aquí!');
    await expect(page.getByRole('link', { name: 'Entrar al mundo 1: Explorador' })).toContainText('¡Mundo completado!');
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Inicio' }).click();
    await expect(page.getByRole('region', { name: '¡Tu reto inicial te espera!' })).toHaveCount(0);
  });

  test('RN-05: sin el reto inicial el mapa no se abre, y desde el mapa se llega al reto', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Lía', avatar: 'koala' }]);
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Lía');
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
    await expect(page.getByText('Primero, tu reto inicial')).toBeVisible();
    await expect(page.getByRole('link', { name: /^Entrar al mundo/ })).toHaveCount(0);
    await page.getByRole('link', { name: 'Ir a mi reto' }).click();
    await expect(contador(page, 1)).toBeVisible();
  });

  test('RF-037: la docente asigna un reto de repaso y ve cuánto avanzó cada habilidad', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Teo', avatar: 'panda' }]);
    await retoTerminado(request, aula, 'Teo'); // inicial: falla todo

    await abrirAula(page, aula);
    const repaso = page.getByRole('region', { name: 'Reto de repaso' });
    await expect(repaso.getByRole('listitem').filter({ hasText: 'Teo' })).toContainText('Inicial: Terminado');
    await repaso.getByRole('button', { name: 'Asignar reto de repaso a toda el aula' }).click();
    await expect(repaso.getByText('Reto de repaso asignado a 1 estudiante.')).toBeVisible();
    await expect(repaso.getByRole('listitem').filter({ hasText: 'Teo' })).toContainText('Repaso: Por empezar');
    await salirDelPanel(page);

    // El niño ve su reto de repaso en el inicio.
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Teo');
    await expect(page.getByRole('region', { name: 'Tu docente te dejó un reto de repaso' })).toBeVisible();
    await salirDelPanel(page);

    await retoTerminado(request, aula, 'Teo', ['LIT', 'VOC', 'INF', 'CRI', 'ARG']); // repaso: acierta todo
    await abrirAula(page, aula);
    const fila = page.getByRole('region', { name: 'Reto de repaso' }).getByRole('listitem').filter({ hasText: 'Teo' });
    await expect(fila).toContainText('Repaso: Terminado');
    await expect(fila.getByLabel('Cambios de Teo desde el reto inicial')).toContainText('Literal +100');
  });
});
