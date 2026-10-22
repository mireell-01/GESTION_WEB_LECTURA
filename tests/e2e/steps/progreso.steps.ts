import { expect, Page } from '@playwright/test';

import { idMundo, tituloMision } from '../support/aventura';
import { retoTerminado, sesionDelNino } from '../support/diagnostico';
import { diaLima, docenteConAula, PIN_PRUEBA, sesionApi, tabletDelAulaActivada } from '../support/escuela';
import { escribirPin, esperarAreaEstudiante } from '../support/iam';
import { ENUNCIADOS, lecturaKilla, leerPorApi, publicadores } from '../support/lectura';
import { maestriaGuardada } from '../support/progreso';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos de los escenarios del perfil lector (RF-052 a RF-055, RN-07, RN-09, RN-20). */

const NUMERO_MUNDO: Record<string, number> = { Explorador: 1, Detective: 2, Investigador: 3, Crítico: 4 };

async function entrarComoMateo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
}

const habilidades = (page: Page) => page.getByRole('list', { name: 'Tus habilidades' }).getByRole('listitem');
const recomendadas = (page: Page) => page.getByRole('list', { name: 'Lecturas recomendadas' }).getByRole('listitem');

// ── RF-052, RF-054, RF-055 (UAT-01) ───────────────────────────────────────

Dado('un niño de 9 años que hizo su reto inicial y leyó dos lecturas, fallando en las inferencias', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']);
  const quienes = await publicadores(request);
  const nino = await sesionDelNino(request, mundo.aula, 'Mateo');
  for (let i = 0; i < 2; i++) {
    const killa = await lecturaKilla(request, {}, quienes);
    await leerPorApi(request, mundo.aula, 'Mateo', killa.lecturaId, { nino, terminar: true, fallar: [ENUNCIADOS.seleccion] });
  }
  await lecturaKilla(request, {}, quienes); // otra de inferencias, aún sin leer
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
});

Cuando('abre su perfil lector', async ({ page }) => {
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Progreso' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tu perfil lector' })).toBeVisible();
});

Entonces('su perfil lector muestra el nivel de cada una de las 5 habilidades', async ({ page }) => {
  await expect(habilidades(page)).toHaveCount(5);
  for (const [nombre, etiqueta] of [
    ['Encontrar lo que dice el texto', 'Destacado'],
    ['Descubrir lo que no se dice', 'En inicio'],
    ['Opinar sobre lo que lees', 'En proceso'],
    ['Dar buenas razones', 'En proceso'],
    ['Entender palabras nuevas', 'Aún descubriendo'], // RN-08: aún con menos de 5 preguntas
  ]) {
    await expect(habilidades(page).filter({ hasText: nombre })).toContainText(etiqueta as string);
  }
});

Entonces('{string} aparece para reforzar', async ({ page }, nombre: string) => {
  await expect(habilidades(page).filter({ hasText: nombre })).toContainText('¡A practicar!');
  await expect(habilidades(page).filter({ hasText: '¡A practicar!' })).toHaveCount(1);
});

Entonces('le recomienda una lectura para practicarla', async ({ page }) => {
  await expect(recomendadas(page).filter({ hasText: 'Para practicar: descubrir lo que no se dice' })).toHaveCount(1);
});

// ── RF-053, RN-07 ─────────────────────────────────────────────────────────

Dado('un niño de 9 años que hizo su reto inicial y está leyendo', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']);
  const killa = await lecturaKilla(request);
  mundo.killa = killa;
  await leerPorApi(request, mundo.aula, 'Mateo', killa.lecturaId, { hasta: ENUNCIADOS.seleccion });
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
  await page.goto(`/estudiante/lecturas/${killa.lecturaId}`);
  await expect(page.getByRole('heading', { level: 2, name: ENUNCIADOS.seleccion })).toBeVisible();
});

Cuando('responde bien la pregunta de inferencia sin pistas', async ({ page }) => {
  await page.getByRole('button', { name: 'Opción B: Le dolía algo' }).click();
  await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();
});

Entonces('su maestría en inferencias sube con el promedio móvil de RN-07', async ({ mundo }) => {
  const m = await maestriaGuardada(mundo.aula!.estudiantes['Mateo'] as string, 'INF');
  const ultimo = m.cambios.at(-1)!;
  // Sin pistas vale 1; dificultad 3: 1 × 1,1 × 100 = 110, acotado a 100. EMA α = 0,3.
  expect(ultimo).toMatchObject({ origen: 'ITEM', nuevo: Math.round((0.3 * 100 + 0.7 * ultimo.anterior) * 100) / 100 });
  expect(m.valor).toBe(ultimo.nuevo);
  expect(ultimo.nuevo).toBeGreaterThan(ultimo.anterior);
});

// ── RN-09: desbloqueo real por maestría y misiones ────────────────────────

Dado('un niño en el mundo {string} con 3 misiones de una lectura cada una', async ({ page, request, mundo }, nombre: string) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo', ['LIT', 'VOC']); // RF-033: empieza en el Detective
  mundo.lecturas = [];
  const quienes = await publicadores(request);
  for (let i = 0; i < 3; i++) {
    const killa = await lecturaKilla(request, {}, quienes);
    const r = await request.post(`/api/v1/backoffice/mundos/${await idMundo(NUMERO_MUNDO[nombre] as number)}/misiones`, {
      headers: quienes.editora,
      data: { rangoEdad: 'R2', titulo: tituloMision(`Misión ${i + 1}`), lecturaIds: [killa.lecturaId] },
    });
    expect(r.status(), await r.text()).toBe(201);
    mundo.lecturas.push(killa.lecturaId);
  }
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
});

Cuando('termina las 3 lecturas respondiendo bien las inferencias', async ({ request, mundo }) => {
  const nino = await sesionDelNino(request, mundo.aula!, 'Mateo');
  for (const lecturaId of mundo.lecturas!) await leerPorApi(request, mundo.aula!, 'Mateo', lecturaId, { nino, terminar: true });
});

Entonces('su maestría en inferencias llega a {int}', async ({ mundo }, minimo: number) => {
  // 0 del reto → 30 → 51 → 65,7 (RN-07), y las 3 misiones completadas (RN-09).
  expect((await maestriaGuardada(mundo.aula!.estudiantes['Mateo'] as string, 'INF')).valor).toBeGreaterThanOrEqual(minimo);
});

// ── RF-055, RN-20 ─────────────────────────────────────────────────────────

Dado('un niño de 9 años con una lectura asignada por su docente', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await retoTerminado(request, mundo.aula, 'Mateo');
  mundo.killa = await lecturaKilla(request);
  const r = await request.post(`/api/v1/aulas/${mundo.aula.aulaId}/asignaciones`, {
    headers: await sesionApi(request, mundo.aula.docente),
    data: { tipo: 'LECTURA', contenidoId: mundo.killa.lecturaId, fechaLimite: diaLima(5) },
  });
  expect(r.status(), await r.text()).toBe(201);
  await tabletDelAulaActivada(page, request, mundo.aula);
  await entrarComoMateo(page);
});

Entonces('la primera recomendación es {string}', async ({ page, mundo }, motivo: string) => {
  const primera = recomendadas(page).first();
  await expect(primera).toContainText(motivo);
  await expect(primera).toContainText(mundo.killa!.titulo);
});
