import { expect, Page, test as base } from '@playwright/test';

import { filtrarPorTema } from '../../support/contenido';
import { abrirAula, diaLima, docenteConAula, PIN_PRUEBA, sesionApi, tabletDelAulaActivada } from '../../support/escuela';
import { escribirPin, esperarAreaEstudiante, ipSimulada, salirDelPanel } from '../../support/iam';
import { arrastrar, DESENLACE_RIO, ENUNCIADOS, lecturaKilla, leerPorApi, ORDEN_CORRECTO, ordenarConBotones, PREDICCION, respuestaGuardada, vozSimulada } from '../../support/lectura';

/** Cada prueba es un dispositivo distinto (IP simulada): así el límite de ingresos por IP (RNF-019) no las mezcla. */
const test = base.extend({
  extraHTTPHeaders: async ({}, use) => {
    await use({ 'X-Forwarded-For': ipSimulada() });
  },
});

/**
 * Nivel 3 — Lectura interactiva de punta a punta (RF-038 a RF-051) en escritorio, tablet y celular:
 * el niño predice, lee con preguntas en sus oraciones de anclaje, recibe pistas, busca evidencias,
 * elige su camino, ordena, escribe, defiende su respuesta y cierra; la docente valora con la rúbrica.
 */
test.describe('Lectura interactiva (RF-038 a RF-051)', () => {
  test.setTimeout(150_000);

  async function entrar(page: Page, alias: string) {
    await page.goto('/');
    await page.getByRole('button', { name: alias }).click();
    await escribirPin(page, PIN_PRUEBA);
    await esperarAreaEstudiante(page, alias);
  }

  /** Desde su biblioteca (Módulo 3) abre la lectura con "¡Leer ahora!". */
  async function abrirDesdeBiblioteca(page: Page, lectura: { titulo: string; tematica: string }) {
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name: 'Biblioteca' }).click();
    await filtrarPorTema(page, lectura.tematica);
    await page.getByRole('link', { name: `Abrir ${lectura.titulo}` }).click();
    await page.getByRole('link', { name: '¡Leer ahora!' }).click();
    await expect(page.getByRole('heading', { level: 1, name: lectura.titulo })).toBeVisible();
  }

  const pregunta = (page: Page, enunciado: string) => expect(page.getByRole('heading', { level: 2, name: enunciado, exact: true })).toBeVisible();
  const texto = (page: Page) => page.getByRole('article', { name: 'El texto' });

  test('el niño predice, lee con preguntas en sus anclajes, usa una pista, elige su camino y cierra su lectura', async ({ page, request }) => {
    const lectura = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Mateo');
    await abrirDesdeBiblioteca(page, lectura);

    // RF-038: primero la predicción con el título y la imagen; el texto aún no se ve.
    await pregunta(page, PREDICCION);
    await expect(texto(page)).toHaveCount(0);
    await page.getByLabel('Lo que creo que pasará').fill('Creo que la llama se enfermará');
    await page.getByRole('button', { name: 'Empezar a leer' }).click();

    // RF-039: el texto llega hasta la oración de anclaje y la pregunta no deja avanzar.
    await expect(texto(page)).toContainText('Un día Pancho no quiso comer.');
    await expect(texto(page)).not.toContainText('espina');
    await pregunta(page, ENUNCIADOS.seleccion);
    // RF-045: si falla, la pista P1 (sin la respuesta); luego acierta.
    await page.getByRole('button', { name: 'Opción A: Estaba feliz' }).click();
    await expect(page.getByRole('list', { name: 'Tus pistas' })).toContainText('Pista 1: Vuelve a la oración que acabas de leer.');
    await expect(page.getByText('Mira por qué')).toHaveCount(0);
    await page.getByRole('button', { name: 'Opción B: Le dolía algo' }).click();
    await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();

    // RF-043: toca en el texto las oraciones que lo demuestran.
    await pregunta(page, ENUNCIADOS.evidencia);
    await texto(page).getByRole('button', { name: 'Killa vio que tenía una espina en la pata.' }).click();
    await expect(page.getByText('Elegiste 1 oración.')).toBeVisible();
    await page.getByRole('button', { name: 'Esta es mi evidencia' }).click();

    // RF-046: si cierra y vuelve, sigue donde quedó (la historia ramificada).
    await expect(page.getByRole('heading', { name: '¿Qué camino eliges?' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '¿Qué camino eliges?' })).toBeVisible();
    await expect(page.getByText('Pensaste: «Creo que la llama se enfermará»')).toBeVisible();

    // RF-048: su decisión define cómo sigue la historia.
    await page.getByRole('button', { name: 'Ir al río' }).click();
    await expect(page.getByText('Elegiste: Ir al río')).toBeVisible();
    await expect(page.getByText(DESENLACE_RIO)).toBeVisible();

    // RF-042: ordena con los botones (la alternativa accesible al arrastre).
    await pregunta(page, ENUNCIADOS.ordenar);
    await ordenarConBotones(page, ORDEN_CORRECTO);
    await page.getByRole('button', { name: 'Listo, este es el orden' }).click();
    await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();

    // RF-040: selección múltiple.
    await pregunta(page, ENUNCIADOS.multiple);
    await page.getByRole('button', { name: 'Opción A: Miró con atención' }).click();
    await page.getByRole('button', { name: 'Opción C: Lo ayudó con cuidado' }).click();
    await expect(page.getByRole('button', { name: 'Opción C: Lo ayudó con cuidado' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Responder', exact: true }).click();

    // RF-041: escribe (hasta 500 letras) y el filtro cambia lo no apropiado.
    await pregunta(page, ENUNCIADOS.escritura);
    await page.getByLabel('Tu respuesta').fill('Sí, porque le dolía, idiota');
    await page.getByRole('button', { name: 'Enviar mi respuesta' }).click();
    await expect(page.getByText('Guardamos tu respuesta. Cambiamos algunas palabras por ***.')).toBeVisible();

    // RF-044: defiende lo que escribió.
    await pregunta(page, ENUNCIADOS.defiende);
    await expect(page.getByText('Tu respuesta: Sí, porque le dolía, ******')).toBeVisible();
    await page.getByRole('button', { name: 'Opción A: El texto dice que tenía una espina' }).click();

    // RF-047: el cierre contrasta su predicción con lo que pasó y pide una reflexión.
    await expect(page.getByRole('heading', { name: '¿Acertaste?' })).toBeVisible();
    const cierre = page.getByRole('region', { name: '¿Acertaste?' });
    await expect(cierre).toContainText('Creo que la llama se enfermará');
    await expect(cierre).toContainText(DESENLACE_RIO);
    await cierre.getByRole('textbox').fill('Pensé que se enfermaba, pero tenía una espina');
    await page.getByRole('button', { name: 'Terminar mi lectura' }).click();
    await expect(page.getByRole('heading', { name: '¡Lectura terminada!' })).toBeVisible();
    await expect(page.getByText('Hiciste 6 actividades.')).toBeVisible();
    await expect(page.getByText('1 con ayuda de una pista.')).toBeVisible();
    await expect(page.getByText('Tu profe leerá lo que escribiste.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver mis mundos' })).toBeVisible();

    // RN-07: acertar tras P1 vale 0,75.
    const guardada = await respuestaGuardada(aula.estudiantes['Mateo'] as string, ENUNCIADOS.seleccion);
    expect(Number(guardada.puntajeItem)).toBe(0.75);
  });

  test('RF-045: tras agotar las pistas ve la explicación modelada y puede seguir leyendo', async ({ page, request }) => {
    const lectura = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Teo', avatar: 'panda' }]);
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Teo');
    await abrirDesdeBiblioteca(page, lectura);
    await page.getByLabel('Lo que creo que pasará').fill('Se irá de viaje');
    await page.getByRole('button', { name: 'Empezar a leer' }).click();

    for (const [opcion, pistas] of [['Opción A: Estaba feliz', 1], ['Opción C: Tenía sueño', 2], ['Opción A: Estaba feliz', 3]] as const) {
      await page.getByRole('button', { name: opcion }).click();
      await expect(page.getByRole('list', { name: 'Tus pistas' }).getByRole('listitem')).toHaveCount(pistas);
    }
    await page.getByRole('button', { name: 'Opción C: Tenía sueño' }).click();
    await expect(page.getByRole('heading', { name: 'Mira por qué' })).toBeVisible();
    await expect(page.getByText('Más adelante el texto dice que tenía una espina en la pata: le dolía.')).toBeVisible();
    await page.getByRole('button', { name: 'Seguir' }).click();
    await pregunta(page, ENUNCIADOS.evidencia);
    expect(Number((await respuestaGuardada(aula.estudiantes['Teo'] as string, ENUNCIADOS.seleccion)).puntajeItem)).toBe(0);
  });

  test('RF-042: también se ordena arrastrando las tarjetas', async ({ page, request }) => {
    const lectura = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Ana', avatar: 'buho' }]);
    await leerPorApi(request, aula, 'Ana', lectura.lecturaId, { hasta: ENUNCIADOS.ordenar });
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Ana');
    await abrirDesdeBiblioteca(page, lectura);
    await pregunta(page, ENUNCIADOS.ordenar);

    for (let k = 0; k < ORDEN_CORRECTO.length; k++) {
      const filas = page.locator('.ordenar__asa');
      const textos = await page.locator('.ordenar__texto').allTextContents();
      const desde = textos.indexOf(ORDEN_CORRECTO[k] as string);
      if (desde !== k) await arrastrar(page, filas.nth(desde), filas.nth(k));
    }
    await expect(page.locator('.ordenar__texto')).toHaveText(ORDEN_CORRECTO);
    await page.getByRole('button', { name: 'Listo, este es el orden' }).click();
    await expect(page.getByText('¡Muy bien! Sigue así.')).toBeVisible();
  });

  test('RF-049, RF-050: con 6 años escucha la lectura con la oración resaltada y responde dictando', async ({ page, request }) => {
    const lectura = await lecturaKilla(request, { rangoEdad: 'R1' });
    const aula = await docenteConAula(request, [{ alias: 'Lía', avatar: 'koala', anioNacimiento: new Date().getFullYear() - 6 }]);
    await vozSimulada(page, 'Creo que Pancho se enfermará');
    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Lía');
    await abrirDesdeBiblioteca(page, lectura);

    // RF-049: lo dictado aparece para revisarlo antes de enviarlo; el audio no sale del dispositivo.
    await page.getByRole('button', { name: 'Decirlo con mi voz' }).click();
    await expect(page.getByLabel('Lo que creo que pasará')).toHaveValue('Creo que Pancho se enfermará');
    await expect(page.getByText('Revisa lo que dijiste')).toBeVisible();
    await page.getByRole('button', { name: 'Empezar a leer' }).click();

    // RF-050: lectura en voz alta, despacio, resaltando la oración que suena.
    const lector = page.getByRole('group', { name: 'Escuchar la lectura' });
    await lector.getByRole('radio', { name: /Despacio/ }).click();
    await expect(lector.getByRole('radio', { name: /Despacio/ })).toHaveAttribute('aria-checked', 'true');
    await lector.getByRole('button', { name: 'Escuchar la lectura' }).click();
    await expect(texto(page).locator('.lectura-oracion--leyendo')).toHaveText('Killa vivía en Puno.');
    await expect(texto(page).locator('.lectura-oracion--leyendo')).toHaveText('Cada mañana cuidaba a su llama Pancho.');
    expect(await page.evaluate(() => (window as unknown as { __frases: { velocidad: number }[] }).__frases[0]?.velocidad)).toBe(0.75);
    await expect(page.getByRole('button', { name: 'Escuchar la pregunta' })).toBeVisible();
  });

  test('RF-018, RF-051: llega a la lectura desde la misión de su docente, y la docente valora lo que escribió', async ({ page, request }) => {
    const lectura = await lecturaKilla(request);
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    const docente = await sesionApi(request, aula.docente);
    const asignada = await request.post(`/api/v1/aulas/${aula.aulaId}/asignaciones`, { headers: docente, data: { tipo: 'LECTURA', contenidoId: lectura.lecturaId, fechaLimite: diaLima(7) } });
    expect(asignada.status(), await asignada.text()).toBe(201);

    await tabletDelAulaActivada(page, request, aula);
    await entrar(page, 'Mateo');
    await page.getByRole('link', { name: `Leer ${lectura.titulo}` }).click();
    await pregunta(page, PREDICCION);
    await page.getByRole('link', { name: /Salir/ }).click();
    await esperarAreaEstudiante(page, 'Mateo');
    await leerPorApi(request, aula, 'Mateo', lectura.lecturaId, { terminar: true });
    await salirDelPanel(page);

    // RF-051: la docente revisa con la rúbrica de 3 niveles.
    await abrirAula(page, aula);
    const revision = page.getByRole('region', { name: 'Respuestas por revisar' });
    const fila = revision.getByRole('listitem', { name: 'Respuesta de Mateo' });
    await expect(fila).toContainText(ENUNCIADOS.escritura);
    await expect(fila).toContainText('Sí, porque así encontró la espina');
    await expect(fila).toContainText('Su defensa: El texto dice que tenía una espina');
    await fila.getByLabel(/3 · Logrado/).check();
    await fila.getByLabel('Comentario para el estudiante (opcional)').fill('¡Bien explicado con el texto!');
    await fila.getByRole('button', { name: 'Guardar valoración' }).click();
    await expect(revision.getByText('Valoración guardada para Mateo.')).toBeVisible();
    await expect(revision.getByText('No hay respuestas por revisar.')).toBeVisible();
    await revision.getByRole('button', { name: 'Valoradas' }).click();
    await expect(revision.getByRole('listitem', { name: 'Respuesta de Mateo' })).toContainText('Nivel 3: Logrado');
  });
});
