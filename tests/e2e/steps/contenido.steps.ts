import { expect } from '@playwright/test';

import { cuentaBackoffice, CuentaBackoffice, filtrarPorTema, ingresarBackoffice, lecturaPublicada, sesionBackoffice, TEXTO_E2E } from '../support/contenido';
import { docenteConAula, PIN_PRUEBA, tabletDelAulaActivada } from '../support/escuela';
import { escribirPin, esperarAreaEstudiante, ingresarComoAdulto, salirDelPanel } from '../support/iam';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Pasos de los escenarios de Biblioteca y contenido (RF-021 a RF-028). */

interface Estado {
  editora?: CuentaBackoffice;
  revisor?: CuentaBackoffice;
  lecturaId?: string;
  titulo?: string;
  /** Temática única: la biblioteca pagina de a 12 y se filtra por ella (ver filtrarPorTema). */
  tema?: string;
  titulos?: { paraEl: string; otra: string };
}
const estado = new WeakMap<object, Estado>();
const de = (mundo: object): Estado => {
  if (!estado.has(mundo)) estado.set(mundo, {});
  return estado.get(mundo) as Estado;
};
const unico = (titulo: string) => `${titulo} · ${Date.now().toString(36)}`;

async function abrirComo(page: import('@playwright/test').Page, cuenta: CuentaBackoffice, titulo: string) {
  await ingresarBackoffice(page, cuenta);
  await page.goto('/backoffice/lecturas');
  await page.getByRole('link', { name: `Abrir ${titulo}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
}

// ── RF-021: sin licencia no se envía ──────────────────────────────────────

Dado('que soy una editora con mi cuenta y la verificación en dos pasos', async ({ page, mundo }) => {
  de(mundo).editora = await cuentaBackoffice('EDITOR');
  await ingresarBackoffice(page, de(mundo).editora!);
});

Cuando('escribo una lectura completa pero sin licencia', async ({ page, request, mundo }) => {
  const e = de(mundo);
  e.titulo = unico('Sin licencia');
  const sesion = await sesionBackoffice(request, e.editora!);
  const creada = await request.post('/api/v1/backoffice/lecturas', {
    headers: sesion,
    data: { metadatos: { titulo: e.titulo, rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF'], licencia: null }, texto: TEXTO_E2E },
  });
  const { lecturaId, oraciones } = await creada.json();
  await request.put(`/api/v1/backoffice/lecturas/${lecturaId}/actividades`, {
    headers: sesion,
    data: { actividades: [{ momento: 'DESPUES', tipo: 'EVIDENCIA', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca la evidencia', clavesEvidencia: [oraciones[4].id], explicacionModelada: 'La última oración lo dice.', pistas: [{ nivel: 'P1', texto: 'Busca en el segundo párrafo.' }] }] }] },
  });
  await page.goto(`/backoffice/lecturas/${lecturaId}`);
  await expect(page.getByRole('heading', { level: 1, name: e.titulo })).toBeVisible();
});

Entonces('el panel de revisión dice {string}', async ({ page }, problema: string) => {
  await expect(page.getByText('Antes de enviar a revisión falta:')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: problema })).toBeVisible();
});

Entonces('no puedo enviarla a revisión', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Enviar a revisión' })).toBeDisabled();
});

// ── RF-026: devolver y aprobar ────────────────────────────────────────────

Dado('que una editora envió a revisión la lectura {string}', async ({ request, mundo }, titulo: string) => {
  const e = de(mundo);
  e.editora = await cuentaBackoffice('EDITOR');
  e.revisor = await cuentaBackoffice('REVISOR');
  e.titulo = unico(titulo);
  e.tema = unico('Animales');
  const sesion = await sesionBackoffice(request, e.editora);
  const creada = await request.post('/api/v1/backoffice/lecturas', {
    headers: sesion,
    data: { metadatos: { titulo: e.titulo, rangoEdad: 'R2', nivelDificultad: 2, tematica: e.tema, tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF'], licencia: 'CC BY 4.0' }, texto: TEXTO_E2E },
  });
  const { lecturaId, oraciones } = await creada.json();
  e.lecturaId = lecturaId;
  await request.put(`/api/v1/backoffice/lecturas/${lecturaId}/actividades`, {
    headers: sesion,
    data: { actividades: [{ momento: 'DESPUES', tipo: 'EVIDENCIA', items: [{ habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca la evidencia', clavesEvidencia: [oraciones[4].id], explicacionModelada: 'La última oración lo dice.', pistas: [{ nivel: 'P1', texto: 'Busca en el segundo párrafo.' }] }] }] },
  });
  expect((await request.post(`/api/v1/backoffice/lecturas/${lecturaId}/enviar-revision`, { headers: sesion })).status()).toBe(200);
});

Cuando('el revisor la devuelve con el comentario {string}', async ({ page, mundo }, comentario: string) => {
  const e = de(mundo);
  await abrirComo(page, e.revisor!, e.titulo!);
  await page.getByRole('button', { name: 'Devolver con comentarios' }).click();
  await page.getByLabel('¿Qué hay que corregir?').fill(comentario);
  await page.getByRole('button', { name: 'Devolver a la autora' }).click();
  await expect(page.locator('.cabecera-aula').getByText('Borrador')).toBeVisible();
  await salirDelPanel(page);
});

Entonces('la autora ve la lectura en borrador con el comentario {string}', async ({ page, mundo }, comentario: string) => {
  const e = de(mundo);
  await abrirComo(page, e.editora!, e.titulo!);
  await expect(page.locator('.cabecera-aula').getByText('Borrador')).toBeVisible();
  await expect(page.getByText('El revisor la devolvió:')).toBeVisible();
  await expect(page.getByText(comentario)).toBeVisible();
});

Cuando('el revisor la aprueba', async ({ page, mundo }) => {
  const e = de(mundo);
  await abrirComo(page, e.revisor!, e.titulo!);
  await page.getByRole('button', { name: 'Aprobar y publicar' }).click();
  await expect(page.getByText('Publicada: está en la biblioteca y se puede asignar a las aulas.')).toBeVisible();
  await salirDelPanel(page);
});

Entonces('una docente encuentra {string} en la biblioteca', async ({ page, request, mundo }, _titulo: string) => {
  // El título real lleva un sufijo único por escenario (ver "unico").
  const e = de(mundo);
  mundo.aula = await docenteConAula(request, [{ alias: 'Lucía', avatar: 'zorro' }]);
  await ingresarComoAdulto(page, mundo.aula.docente.email, mundo.aula.docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/); // ingresarComoAdulto no espera: sin esto, el goto cortaría el ingreso
  await page.goto('/docente/biblioteca');
  await filtrarPorTema(page, e.tema!);
  await page.getByRole('link', { name: `Abrir ${e.titulo}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: e.titulo })).toBeVisible();
});

Entonces('puede elegirla al crear una asignación para su aula', async ({ page, mundo }) => {
  const e = de(mundo);
  await page.goto('/docente');
  await page.getByRole('link', { name: 'Abrir 3.° B' }).click();
  await page.getByRole('button', { name: '+ Nueva asignación' }).click();
  await expect(page.getByLabel('Lectura', { exact: true }).locator('option', { hasText: e.titulo })).toHaveCount(1);
});

// ── RF-027: versiones ─────────────────────────────────────────────────────

Dado('que la lectura {string} está publicada', async ({ request, mundo }, titulo: string) => {
  const e = de(mundo);
  e.titulo = unico(titulo);
  e.tema = unico('Ciencia');
  e.lecturaId = (await lecturaPublicada(request, { titulo: e.titulo, tematica: e.tema })).lecturaId;
});

Cuando('una editora crea una versión nueva y le cambia el título a {string}', async ({ page, mundo }, nuevo: string) => {
  const e = de(mundo);
  e.editora = await cuentaBackoffice('EDITOR');
  await abrirComo(page, e.editora, e.titulo!);
  await page.getByRole('button', { name: 'Crear una versión nueva' }).click();
  await expect(page.getByText(/La versión 1 sigue publicada/)).toBeVisible();
  await page.getByLabel('Título').fill(nuevo);
  await page.getByRole('button', { name: 'Guardar datos y texto' }).click();
  await expect(page.getByText('Guardado.')).toBeVisible();
  await salirDelPanel(page);
});

Entonces('la biblioteca sigue mostrando {string} hasta que se apruebe la versión nueva', async ({ page, request, mundo }, _titulo: string) => {
  const e = de(mundo);
  const aula = await docenteConAula(request, [{ alias: 'Leo', avatar: 'koala' }]);
  await ingresarComoAdulto(page, aula.docente.email, aula.docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
  await page.goto('/docente/biblioteca');
  await filtrarPorTema(page, e.tema!);
  await expect(page.getByRole('link', { name: `Abrir ${e.titulo}` })).toBeVisible();
});

// ── RF-028: alcance del estudiante ────────────────────────────────────────

Dado('que hay una lectura publicada para 8–9 años y otra para 10–12 años', async ({ request, mundo }) => {
  const e = de(mundo);
  e.tema = unico('Cuentos');
  e.titulos = {
    paraEl: (await lecturaPublicada(request, { titulo: unico('Para 8–9 años'), rangoEdad: 'R2', nivelDificultad: 2, tematica: e.tema })).titulo,
    otra: (await lecturaPublicada(request, { titulo: unico('Para 10–12 años'), rangoEdad: 'R3', nivelDificultad: 4, tematica: e.tema })).titulo,
  };
});

Cuando('un niño de 9 años abre su biblioteca', async ({ page, request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  await tabletDelAulaActivada(page, request, mundo.aula);
  await page.goto('/');
  await page.getByRole('button', { name: 'Mateo' }).click();
  await escribirPin(page, PIN_PRUEBA);
  await esperarAreaEstudiante(page, 'Mateo');
  await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Biblioteca' }).click();
  await expect(page.getByRole('heading', { name: 'Tu biblioteca' })).toBeVisible();
});

Entonces('ve solo la lectura para 8–9 años', async ({ page, mundo }) => {
  const { titulos, tema } = de(mundo);
  await filtrarPorTema(page, tema!);
  await expect(page.getByRole('link', { name: `Abrir ${titulos!.paraEl}` })).toBeVisible();
  await expect(page.getByRole('link', { name: `Abrir ${titulos!.otra}` })).toHaveCount(0);
});
