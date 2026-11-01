import { expect, Page, test as base } from '@playwright/test';

import { deshacerParametrosPublicados, enlaceDeAlta, institucionDePrueba } from '../../support/administracion';
import { cuentaBackoffice, CuentaBackoffice, ingresarBackoffice, sesionBackoffice } from '../../support/contenido';
import { docenteConAula, PIN_PRUEBA, sesionApi } from '../../support/escuela';
import { correoUnico, ingresarComoAdulto, ipSimulada, salirDelPanel } from '../../support/iam';

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

/** La docente en la lista de la administración (buscada por su correo, que es único). */
async function buscarDocente(page: Page, email: string) {
  await page.goto('/backoffice/docentes');
  await page.getByLabel('Nombre o correo').fill(email);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const fila = page.getByRole('list', { name: 'Cuentas docentes' }).getByRole('listitem');
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText(email);
  return fila;
}

/**
 * Nivel 3 — Administración de la plataforma de punta a punta (RF-076 a RF-078) en escritorio, tablet y
 * celular: docentes (suspender, reactivar, dar de alta), instituciones, auditoría y gamificación.
 */
test.describe('Administración de la plataforma (RF-076 a RF-078)', () => {
  test.setTimeout(150_000);
  let admin: CuentaBackoffice;

  test.beforeEach(async () => {
    admin = await cuentaBackoffice('ADMIN_PLATAFORMA');
  });

  test('RF-076: suspender a una docente le quita el acceso al instante, sus niños siguen entrando; al reactivarla vuelve', async ({ page, request, browser }, info) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    // La tablet del aula ya estaba activada (la docente la activó antes).
    const docenteApi = await sesionApi(request, aula.docente);
    const { tokenDispositivo } = await (await request.post(`/api/v1/aulas/${aula.aulaId}/dispositivos`, { headers: docenteApi, data: { nombre: 'Tablet' } })).json();

    // La docente tiene su panel abierto en otra computadora.
    const otra = await browser.newContext({ baseURL: info.project.use.baseURL, extraHTTPHeaders: { 'X-Forwarded-For': ipSimulada() } });
    const docente = await otra.newPage();
    await ingresarComoAdulto(docente, aula.docente.email, aula.docente.contrasena);
    await expect(docente).toHaveURL(/\/docente$/);

    await ingresarBackoffice(page, admin);
    const fila = await buscarDocente(page, aula.docente.email);
    await expect(fila).toContainText('1 aula · 1 estudiante');
    await fila.getByRole('button', { name: 'Suspender' }).click();
    await expect(fila.getByRole('note')).toHaveText('Perderá el acceso al instante. Su aula queda en solo lectura; sus estudiantes siguen leyendo.');
    await fila.getByRole('button', { name: 'Sí, suspender' }).click();
    await expect(page.getByText(/cuenta suspendida, ya no puede ingresar\. Su aula queda en solo lectura/)).toBeVisible();
    await expect(fila).toContainText('Suspendida');
    await expect(fila).toContainText('Aulas en solo lectura');
    await sinDesbordes(page);

    // Al instante: su panel ya no responde y no puede volver a ingresar.
    await docente.reload();
    await expect(docente).toHaveURL(/\/ingresar/);
    await ingresarComoAdulto(docente, aula.docente.email, aula.docente.contrasena);
    await expect(docente.getByText('Tu cuenta está suspendida. Comunícate con la administración.')).toBeVisible();
    // Mateo sigue entrando con su PIN en la tablet del aula.
    const mateo = await request.post('/api/v1/acceso-estudiante/login', { data: { tokenDispositivo, perfilId: aula.estudiantes['Mateo'], pin: PIN_PRUEBA } });
    expect(mateo.status()).toBe(200);

    await fila.getByRole('button', { name: 'Reactivar' }).click();
    await expect(fila).toContainText('Activa');
    await ingresarComoAdulto(docente, aula.docente.email, aula.docente.contrasena);
    await expect(docente).toHaveURL(/\/docente$/);
    await otra.close();
  });

  test('RF-076: da de alta a un docente, que crea su contraseña con el enlace del correo', async ({ page, request }) => {
    const email = correoUnico('alta');
    await ingresarBackoffice(page, admin);
    await page.goto('/backoffice/docentes');
    await page.getByLabel('Nombre y apellido').fill('Luis Ramos');
    await page.getByLabel('Correo', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Dar de alta' }).click();
    await expect(page.getByText(`Listo: le enviamos a ${email} un enlace para crear su contraseña (vence en 72 horas).`)).toBeVisible();
    await expect(page.getByRole('listitem', { name: 'Luis Ramos' }).first()).toContainText('Aún no crea su contraseña');
    await sinDesbordes(page);
    await salirDelPanel(page);

    const enlace = new URL(await enlaceDeAlta(request, email));
    await page.goto(`${enlace.pathname}${enlace.search}`);
    await page.getByLabel('Nueva contraseña').fill('Docente-Nueva-2026');
    await page.getByLabel('Repite la contraseña').fill('Docente-Nueva-2026');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click();
    await expect(page.getByRole('heading', { name: /Contraseña actualizada/ })).toBeVisible();
    await ingresarComoAdulto(page, email, 'Docente-Nueva-2026');
    await expect(page).toHaveURL(/\/docente$/);
  });

  test('RF-076: una institución suspendida ya no se elige para aulas nuevas', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    const nombre = institucionDePrueba();
    await ingresarBackoffice(page, admin);
    await page.goto('/backoffice/instituciones');
    await page.getByLabel('Nombre').fill(nombre);
    await page.getByLabel('Región (opcional)').fill('Puno');
    await page.getByRole('button', { name: 'Registrar institución' }).click();
    await expect(page.getByText('Registrada.')).toBeVisible();
    const fila = page.getByRole('listitem', { name: nombre });
    await expect(fila).toContainText('Activa');
    await fila.getByRole('button', { name: 'Suspender' }).click();
    await fila.getByRole('button', { name: 'Sí, suspender' }).click();
    await expect(fila).toContainText('Suspendida');
    await sinDesbordes(page);
    await salirDelPanel(page);

    // La docente no puede crear un aula en ella (ni se le sugiere).
    await ingresarComoAdulto(page, aula.docente.email, aula.docente.contrasena);
    await page.getByRole('button', { name: '+ Nueva aula' }).click();
    const formulario = page.getByRole('form', { name: 'Nueva aula' });
    await expect(formulario.locator(`datalist option[value="${nombre}"]`)).toHaveCount(0);
    await formulario.getByLabel('Nombre del aula').fill('5.° B');
    await formulario.getByLabel('Institución educativa').fill(nombre.toUpperCase());
    await formulario.getByLabel('Autoridad que firmó el consentimiento').fill('Dir. Ruiz');
    await formulario.getByRole('checkbox').check();
    await formulario.getByRole('button', { name: 'Crear aula' }).click();
    await expect(formulario.getByText(/está suspendida en LectoAventura/)).toBeVisible();
  });

  test('RF-077: la administración ve en la auditoría quién cambió un PIN, cuándo y desde qué IP', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    const docenteApi = await sesionApi(request, aula.docente);
    const pin = await request.post(`/api/v1/estudiantes/${aula.estudiantes['Mateo']}/pin/restablecer`, { headers: docenteApi, data: { pinNuevo: '3691' } });
    expect(pin.status()).toBe(200);

    await ingresarBackoffice(page, admin);
    await page.goto('/backoffice/auditoria');
    await page.getByLabel('Acción').selectOption({ label: 'PIN restablecido' });
    await page.getByRole('button', { name: 'Filtrar' }).click();
    const primera = page.getByRole('table').getByRole('row').nth(1);
    await expect(primera).toContainText('PIN restablecido');
    await expect(primera).toContainText('(Docente)');
    await expect(primera).toContainText('Estudiante');
    await expect(primera).toContainText(/2001:db8:/);
    await sinDesbordes(page);
  });

  test('RF-078: publica una versión nueva de la gamificación que aplica desde ahora', async ({ page, request }) => {
    const { version } = await (await request.get('/api/v1/admin/parametros-gamificacion', { headers: await sesionBackoffice(request, admin) })).json();
    try {
      await ingresarBackoffice(page, admin);
      await page.goto('/backoffice/gamificacion');
      const puntos = page.getByRole('group', { name: 'Puntos' });
      await puntos.getByLabel('Lectura terminada').fill('25');
      await page.getByRole('button', { name: 'Publicar versión nueva' }).click();
      await page.getByRole('button', { name: `Sí, publicar la versión ${version + 1}` }).click();
      await expect(page.getByText(`Publicada la versión ${version + 1}: se aplica desde ahora. Los logros ya otorgados no cambian.`)).toBeVisible();
      await expect(page.getByRole('list', { name: 'Versiones publicadas' })).toContainText(`Versión ${version + 1}`);
      await expect(puntos.getByLabel('Lectura terminada')).toHaveValue('25');

      // Un valor fuera de rango ni siquiera pide confirmación: el campo dice su rango (la API también lo rechaza).
      await puntos.getByLabel('Lectura terminada').fill('900');
      await page.getByRole('button', { name: 'Publicar versión nueva' }).click();
      await expect(page.getByRole('button', { name: `Sí, publicar la versión ${version + 2}` })).toHaveCount(0);
      expect(await puntos.getByLabel('Lectura terminada').evaluate((e) => (e as HTMLInputElement).validity.rangeOverflow)).toBe(true);
      await expect(puntos.getByText('Entre 0 y 500').first()).toBeVisible();
      await sinDesbordes(page);
    } finally {
      await deshacerParametrosPublicados(version);
    }
  });

  test('una docente no entra a la administración', async ({ page, request }) => {
    const aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
    await ingresarComoAdulto(page, aula.docente.email, aula.docente.contrasena);
    await expect(page).toHaveURL(/\/docente$/);
    await page.goto('/backoffice/docentes');
    await expect(page).toHaveURL(/\/docente$/);
    const api = await request.get('/api/v1/admin/docentes', { headers: await sesionApi(request, aula.docente) });
    expect(api.status()).toBe(403);
  });
});
