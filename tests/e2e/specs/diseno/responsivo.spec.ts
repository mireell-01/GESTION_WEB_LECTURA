import { expect, Page, test as base } from '@playwright/test';

import { misionConLecturas, tituloMision } from '../../support/aventura';
import { cuentaBackoffice, filtrarPorTema, ingresarBackoffice, lecturaPublicada, sesionBackoffice, TEXTO_E2E } from '../../support/contenido';
import { abrirAula, docenteConAula, PIN_PRUEBA, sembrarCatalogoE2E, sesionApi, tabletDelAulaActivada } from '../../support/escuela';
import { cuentaVerificada, escribirPin, esperarAreaEstudiante, ingresarComoAdulto, ipSimulada, salirDelPanel } from '../../support/iam';

/** Cada prueba es un dispositivo distinto (IP simulada) para que el límite por IP (RNF-019) no las mezcle. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Diseño responsivo (RNF-022, RNF-023). Se ejecuta en los tres proyectos
 * (escritorio 1280 px, tablet 820 px y celular 390 px): sin desplazamiento lateral y con
 * todo lo que se toca de al menos 48 × 48 px.
 */
async function revisarPantalla(page: Page): Promise<void> {
  const resultado = await page.evaluate(() => {
    // Casillas, opciones y "elegir archivo" se tocan por su etiqueta, que es la que mide 48 px.
    const tocables = 'button, a, select, input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), label.casilla, label.subir-archivo';
    const visibles = [...document.querySelectorAll<HTMLElement>(tocables)].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    });
    return {
      desborde: document.documentElement.scrollWidth - window.innerWidth,
      pequenos: visibles
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return Math.round(r.height) < 48 || Math.round(r.width) < 48;
        })
        .map((e) => `${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30)} (${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)})`),
    };
  });
  expect(resultado.desborde, 'la página no debe desplazarse hacia los lados').toBeLessThanOrEqual(0);
  expect(resultado.pequenos, 'objetivos táctiles menores de 48 px').toEqual([]);
}

test.describe('Diseño responsivo (RNF-022, RNF-023)', () => {
  for (const ruta of ['/', '/ingresar', '/registro', '/recuperar', '/ingresar/estudiante']) {
    test(`${ruta} se adapta sin desbordes y con objetivos táctiles grandes`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await revisarPantalla(page);
    });
  }

  test('el área del estudiante usa la navegación de cada dispositivo', async ({ page, request }, info) => {
    // Familia con un perfil y la tablet vinculada, preparada por la API (RF-005, RF-006, RN-04).
    const { email, contrasena } = await cuentaVerificada(request, { prefijo: 'diseno' });
    const login = await request.post('/api/v1/auth/login', { data: { email, contrasena } });
    const auth = { Authorization: `Bearer ${(await login.json()).accessToken}` };
    await request.post('/api/v1/consentimientos', { headers: auth, data: { otorganteNombre: 'Rosa Prueba', aceptaPolitica: true } });
    const perfil = await request.post('/api/v1/estudiantes', {
      headers: auth,
      data: { alias: 'Mateo', anioNacimiento: 2018, mesNacimiento: 5, avatar: 'zorro', pin: '2580' },
    });
    expect(perfil.status(), await perfil.text()).toBe(201);
    const { tokenDispositivo } = await (await request.post('/api/v1/familia/dispositivos', { headers: auth, data: { nombre: 'Tablet' } })).json();
    await page.addInitScript((token) => localStorage.setItem('lectoaventura.dispositivo', token), tokenDispositivo);

    // Con la tablet vinculada, la app se abre directo en los avatares (CR-01).
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '¿Quién va a leer hoy?' })).toBeVisible();
    await revisarPantalla(page);
    await page.getByRole('button', { name: 'Mateo' }).click();
    await revisarPantalla(page);
    await escribirPin(page, '2580');
    await esperarAreaEstudiante(page, 'Mateo');
    await revisarPantalla(page);

    const nav = page.getByRole('navigation', { name: 'Secciones' });
    const caja = (await nav.boundingBox())!;
    const ventana = page.viewportSize()!;
    if (info.project.name === 'escritorio') {
      // Computadora: barra lateral a la izquierda, de alto completo, con el letrero.
      expect(caja.x).toBe(0);
      expect(caja.height).toBeGreaterThanOrEqual(ventana.height - 1);
    } else {
      // Tablet vertical y celular: barra inferior al alcance del pulgar.
      expect(Math.round(caja.y + caja.height)).toBeGreaterThanOrEqual(ventana.height - 1);
      expect(caja.width).toBeGreaterThanOrEqual(ventana.width - 1);
    }
    // Las secciones futuras se muestran con candado y avisan "muy pronto".
    await nav.getByRole('button', { name: /Progreso/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Progreso llegará muy pronto' })).toBeVisible();
    // Módulo 4: Mundos ya es una sección real.
    await expect(nav.getByRole('link', { name: 'Mundos' })).toBeVisible();
    // Un solo botón "Salir" visible en cada diseño.
    await expect(page.getByRole('button', { name: 'Salir' })).toHaveCount(1);
  });
  test('los paneles del modo escuela se adaptan: docente y familia vinculada (RF-014 a RF-019)', async ({ page, request }) => {
    await sembrarCatalogoE2E();
    const aula = await docenteConAula(request, [
      { alias: 'Mateo', avatar: 'leon' },
      { alias: 'Ana', avatar: 'buho' },
    ]);
    await abrirAula(page, aula);
    await revisarPantalla(page);

    await page.getByRole('button', { name: 'Invitar a la familia de Mateo' }).click();
    const caja = page.getByRole('region', { name: 'Código de invitación para la familia de Mateo' });
    const codigo = (await caja.locator('.invitacion__codigo').innerText()).trim();
    await revisarPantalla(page);

    await page.getByRole('button', { name: '+ Nueva asignación' }).click();
    await page.getByRole('radio', { name: 'Solo algunos estudiantes' }).check();
    await expect(page.getByRole('checkbox', { name: 'Ana', exact: true })).toBeVisible();
    await revisarPantalla(page);

    await page.getByRole('button', { name: 'Varios con CSV' }).click();
    await revisarPantalla(page);

    await page.getByRole('link', { name: 'Mis aulas' }).first().click();
    await expect(page.getByRole('link', { name: 'Abrir 3.° B' })).toBeVisible();
    await revisarPantalla(page);
    await salirDelPanel(page);

    // La familia que canjeó el código ve al niño "Desde su aula".
    const familia = await cuentaVerificada(request, { prefijo: 'diseno-familia' });
    const vinculo = await request.post('/api/v1/familia/vincular', { headers: await sesionApi(request, familia), data: { codigo } });
    expect(vinculo.status(), await vinculo.text()).toBe(201);
    await ingresarComoAdulto(page, familia.email, familia.contrasena);
    await expect(page.getByRole('heading', { name: 'Desde su aula (1)' })).toBeVisible();
    await revisarPantalla(page);
  });
  test('el backoffice de contenido y la biblioteca se adaptan (RF-021 a RF-028)', async ({ page, request }) => {
    test.setTimeout(150_000); // dos cuentas con MFA, una lectura publicada, un aula y siete pantallas
    const sufijo = Date.now().toString(36);
    const { lecturaId, titulo } = await lecturaPublicada(request, { titulo: `Responsiva ${sufijo}`, tematica: `Responsiva ${sufijo}` });
    const tituloBorrador = `Borrador responsivo ${sufijo}`;
    const editora = await cuentaBackoffice('EDITOR');
    const borrador = await request.post('/api/v1/backoffice/lecturas', {
      headers: await sesionBackoffice(request, editora),
      data: { metadatos: { titulo: tituloBorrador, rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['INF'], licencia: 'CC BY 4.0' }, texto: TEXTO_E2E },
    });
    const { lecturaId: idBorrador } = await borrador.json();

    await ingresarBackoffice(page, editora);
    await page.goto('/backoffice/lecturas');
    await expect(page.getByRole('link', { name: `Abrir ${tituloBorrador}` })).toBeVisible();
    await revisarPantalla(page);
    await page.goto(`/backoffice/lecturas/${idBorrador}`);
    await page.getByRole('button', { name: '+ Actividad durante la lectura' }).click();
    await page.getByRole('button', { name: 'Cortar la oración 1' }).click();
    await revisarPantalla(page);
    await page.goto('/backoffice/lecturas/nueva');
    await revisarPantalla(page);
    await salirDelPanel(page);

    const aula = await docenteConAula(request, [{ alias: 'Ana', avatar: 'buho' }]);
    await ingresarComoAdulto(page, aula.docente.email, aula.docente.contrasena);
    await expect(page).toHaveURL(/\/docente$/); // ingresarComoAdulto no espera: sin esto, el goto cortaría el ingreso
    await page.goto('/docente/biblioteca');
    await filtrarPorTema(page, sufijo);
    await expect(page.getByRole('link', { name: `Abrir ${titulo}` })).toBeVisible();
    await revisarPantalla(page);
    await page.goto(`/docente/biblioteca/${lecturaId}`);
    await expect(page.getByRole('heading', { level: 1, name: titulo })).toBeVisible();
    await revisarPantalla(page);
  });
  test('el mapa, un mundo y el backoffice de misiones se adaptan (RF-030 a RF-032)', async ({ page, request }) => {
    test.setTimeout(150_000);
    const editora = await cuentaBackoffice('EDITOR');
    const mision = await misionConLecturas(request, editora, 1, tituloMision('Responsiva'), ['Lectura responsiva']);
    await ingresarBackoffice(page, editora);
    await page.goto('/backoffice/misiones');
    await expect(page.getByRole('heading', { level: 2, name: mision.titulo })).toBeVisible();
    await revisarPantalla(page);
    await page.getByRole('button', { name: '+ Nueva misión' }).click();
    await expect(page.getByLabel('Título de la misión')).toBeVisible();
    await revisarPantalla(page);
    await salirDelPanel(page);

    const aula = await docenteConAula(request, [{ alias: 'Ana', avatar: 'buho' }]);
    await tabletDelAulaActivada(page, request, aula);
    await page.goto('/');
    await page.getByRole('button', { name: 'Ana' }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, 'Ana');
    await revisarPantalla(page);
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Mundos' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Tu mapa de aventuras' })).toBeVisible();
    await revisarPantalla(page);
    await page.getByRole('link', { name: 'Entrar al mundo 1: Explorador' }).click();
    await expect(page.getByRole('heading', { level: 2, name: mision.titulo })).toBeVisible();
    await revisarPantalla(page);
  });
});
