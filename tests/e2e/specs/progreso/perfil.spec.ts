import { expect, Page, test as base } from '@playwright/test';

import { retoTerminado, sesionDelNino } from '../../support/diagnostico';
import { diaLima, docenteConAula, PIN_PRUEBA, sesionApi, tabletDelAulaActivada } from '../../support/escuela';
import { escribirPin, esperarAreaEstudiante, ipSimulada } from '../../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi, publicadores } from '../../support/lectura';
import { maestriaGuardada } from '../../support/progreso';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Perfil lector y recomendaciones de punta a punta (RF-052 a RF-055) en escritorio, tablet
 * y celular: el reto inicial y las lecturas reales mueven la maestría; el niño la ve en su lenguaje,
 * con lo que conviene practicar y sus próximas lecturas (la de su profe primero).
 */
test.describe('Perfil lector y recomendaciones (RF-052 a RF-055)', () => {
  test.setTimeout(150_000);

  async function abrirPerfil(page: Page, alias: string) {
    await page.goto('/');
    await page.getByRole('button', { name: alias }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, alias);
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Progreso' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tu perfil lector' })).toBeVisible();
  }

  const habilidad = (page: Page, nombre: string) => page.getByRole('list', { name: 'Tus habilidades' }).getByRole('listitem').filter({ hasText: nombre });

  test('ve sus 5 habilidades en su lenguaje, lo que debe practicar y una lectura para eso', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await retoTerminado(request, aula, 'Mateo', ['LIT', 'VOC']); // bien en literal y vocabulario
    // Dos lecturas: acierta todo, salvo la pregunta de inferencia, donde agota las pistas (RF-045).
    const quienes = await publicadores(request);
    const nino = await sesionDelNino(request, aula, 'Mateo');
    for (let i = 0; i < 2; i++) {
      const killa = await lecturaKilla(request, {}, quienes);
      await leerPorApi(request, aula, 'Mateo', killa.lecturaId, { nino, terminar: true, fallar: [ENUNCIADOS.seleccion] });
    }
    await lecturaKilla(request, {}, quienes); // una más, sin leer, para practicar inferencias
    const inf = await maestriaGuardada(aula.estudiantes['Mateo'] as string, 'INF');
    expect(inf).toMatchObject({ valor: 0, itemsContados: 5 }); // 3 del reto + 2 con explicación (puntaje 0, RN-07)

    await tabletDelAulaActivada(page, request, aula);
    await abrirPerfil(page, 'Mateo');
    await expect(page.getByRole('list', { name: 'Tus habilidades' }).getByRole('listitem')).toHaveCount(5);
    // RF-052, RN-08: con 5 ítems se declara el nivel; con menos, "Aún descubriendo".
    await expect(habilidad(page, 'Encontrar lo que dice el texto')).toContainText('Destacado');
    await expect(habilidad(page, 'Entender palabras nuevas')).toContainText('Aún descubriendo');
    await expect(habilidad(page, 'Opinar sobre lo que lees')).toContainText('En proceso');
    // RF-054: menos de 40 con al menos 5 ítems → a reforzar.
    const debil = habilidad(page, 'Descubrir lo que no se dice');
    await expect(debil).toContainText('En inicio');
    await expect(debil).toContainText('¡A practicar!');
    await expect(debil.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    await expect(page.getByText('Lees en el nivel 2')).toBeVisible();

    // RF-055: una lectura para practicar la habilidad más débil, que se abre desde aquí.
    const recomendadas = page.getByRole('list', { name: 'Lecturas recomendadas' }).getByRole('listitem');
    const paraPracticar = recomendadas.filter({ hasText: 'Para practicar: descubrir lo que no se dice' });
    await expect(paraPracticar).toHaveCount(1);
    expect(await recomendadas.count()).toBeLessThanOrEqual(3);
    await paraPracticar.getByRole('link', { name: /^Leer: / }).click();
    await expect(page).toHaveURL(/\/estudiante\/lecturas\//);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('RF-055, RN-20: lo que le dejó su profe aparece primero y se abre con la asignación', async ({ page, request }) => {
    const killa = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Teo', avatar: 'panda' }]);
    await retoTerminado(request, aula, 'Teo');
    const r = await request.post(`/api/v1/aulas/${aula.aulaId}/asignaciones`, { headers: await sesionApi(request, aula.docente), data: { tipo: 'LECTURA', contenidoId: killa.lecturaId, fechaLimite: diaLima(5) } });
    expect(r.status(), await r.text()).toBe(201);

    await tabletDelAulaActivada(page, request, aula);
    await abrirPerfil(page, 'Teo');
    const primera = page.getByRole('list', { name: 'Lecturas recomendadas' }).getByRole('listitem').first();
    await expect(primera).toContainText('Misión de tu profe');
    await expect(primera).toContainText(killa.titulo);
    await primera.getByRole('link', { name: `Leer: ${killa.titulo}` }).click();
    await expect(page).toHaveURL(/asignacion=/);
    await expect(page.getByRole('heading', { level: 2, name: '¿Qué crees que le pasará a la llama?' })).toBeVisible();
  });

  test('sin reto inicial todavía, todo está por descubrir', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Lía', avatar: 'koala' }]);
    await tabletDelAulaActivada(page, request, aula);
    await abrirPerfil(page, 'Lía');
    await expect(page.getByText('Cuando hagas tu reto inicial y tus lecturas, aquí verás cuánto vas creciendo.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Tus habilidades' }).getByText('Aún descubriendo')).toHaveCount(5);
  });
});
