import { APIRequestContext, expect, Page } from '@playwright/test';

import { enlaceDeAlta, institucionDePrueba } from '../support/administracion';
import { cuentaBackoffice, ingresarBackoffice, sesionBackoffice } from '../support/contenido';
import { docenteConAula, PIN_PRUEBA, sesionApi } from '../support/escuela';
import { correoUnico, ingresarComoAdulto, salirDelPanel } from '../support/iam';
import { Cuando, Dado, Entonces, Mundo } from './fixtures';

/** Nivel 4 — Pasos de los escenarios de la administración de la plataforma (RF-076 a RF-078, RN-17). */

async function comoAdministracion(page: Page, mundo: Mundo) {
  mundo.admin ??= await cuentaBackoffice('ADMIN_PLATAFORMA');
  if (!page.url().includes('/backoffice')) await ingresarBackoffice(page, mundo.admin);
}

/** La fila de la docente del escenario en la lista de la administración. */
async function filaDocente(page: Page, mundo: Mundo) {
  const email = mundo.aula!.docente.email;
  await page.goto('/backoffice/docentes');
  await page.getByLabel('Nombre o correo').fill(email);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const fila = page.getByRole('list', { name: 'Cuentas docentes' }).getByRole('listitem');
  await expect(fila).toHaveCount(1);
  return fila;
}

async function salirSiHaySesion(page: Page) {
  if (await page.getByRole('button', { name: 'Salir' }).count()) await salirDelPanel(page);
}

// ── Preparación ──────────────────────────────────────────────────────────────

Dado('una docente con su aula y su estudiante Mateo', async ({ request, mundo }) => {
  mundo.aula = await docenteConAula(request, [{ alias: 'Mateo', avatar: 'leon' }]);
  const r = await request.post(`/api/v1/aulas/${mundo.aula.aulaId}/dispositivos`, { headers: await sesionApi(request, mundo.aula.docente), data: { nombre: 'Tablet' } });
  expect(r.status(), await r.text()).toBe(201);
  mundo.tablet = (await r.json()).tokenDispositivo;
});

Dado('una institución registrada por la administración', async ({ page, mundo }) => {
  await comoAdministracion(page, mundo);
  mundo.institucion = institucionDePrueba();
  await page.goto('/backoffice/instituciones');
  await page.getByLabel('Nombre').fill(mundo.institucion);
  await page.getByRole('button', { name: 'Registrar institución' }).click();
  await expect(page.getByRole('listitem', { name: mundo.institucion })).toContainText('Activa');
});

Dado('la docente cambió el PIN de Mateo', async ({ request, mundo }) => {
  const r = await request.post(`/api/v1/estudiantes/${mundo.aula!.estudiantes['Mateo']}/pin/restablecer`, {
    headers: await sesionApi(request, mundo.aula!.docente),
    data: { pinNuevo: '3691' },
  });
  expect(r.status()).toBe(200);
});

// ── Acciones ─────────────────────────────────────────────────────────────────

const suspender = async ({ page, mundo }: { page: Page; mundo: Mundo }) => {
  await comoAdministracion(page, mundo);
  const fila = await filaDocente(page, mundo);
  await fila.getByRole('button', { name: 'Suspender' }).click();
  await fila.getByRole('button', { name: 'Sí, suspender' }).click();
  await expect(fila).toContainText('Suspendida');
};
Cuando('la administración la suspende', suspender);

Cuando('la administración la reactiva', async ({ page, mundo }) => {
  const fila = await filaDocente(page, mundo);
  await fila.getByRole('button', { name: 'Reactivar' }).click();
  await expect(fila).toContainText('Activa');
});

Cuando('la administración da de alta a {string} con su correo', async ({ page, mundo }, nombre: string) => {
  await comoAdministracion(page, mundo);
  mundo.alta = { nombre, email: correoUnico('alta') };
  await page.goto('/backoffice/docentes');
  await page.getByLabel('Nombre y apellido').fill(nombre);
  await page.getByLabel('Correo', { exact: true }).fill(mundo.alta.email);
  await page.getByRole('button', { name: 'Dar de alta' }).click();
  await expect(page.getByText(`Listo: le enviamos a ${mundo.alta.email} un enlace para crear su contraseña (vence en 72 horas).`)).toBeVisible();
});

Cuando('la administración suspende la institución', async ({ page, mundo }) => {
  const fila = page.getByRole('listitem', { name: mundo.institucion! });
  await fila.getByRole('button', { name: 'Suspender' }).click();
  await fila.getByRole('button', { name: 'Sí, suspender' }).click();
  await expect(fila).toContainText('Suspendida');
});

Cuando('la administración filtra la auditoría por {string}', async ({ page, mundo }, accion: string) => {
  await comoAdministracion(page, mundo);
  await page.goto('/backoffice/auditoria');
  await page.getByLabel('Acción').selectOption({ label: accion });
  await page.getByRole('button', { name: 'Filtrar' }).click();
});

Cuando('la administración cambia los puntos por lectura terminada a {int} y publica', async ({ page, request, mundo }, puntos: number) => {
  mundo.admin = await cuentaBackoffice('ADMIN_PLATAFORMA');
  mundo.parametrosDesde = (await (await request.get('/api/v1/admin/parametros-gamificacion', { headers: await sesionBackoffice(request, mundo.admin) })).json()).version;
  await comoAdministracion(page, mundo);
  await page.goto('/backoffice/gamificacion');
  await page.getByRole('group', { name: 'Puntos' }).getByLabel('Lectura terminada').fill(String(puntos));
  await page.getByRole('button', { name: 'Publicar versión nueva' }).click();
  await page.getByRole('button', { name: `Sí, publicar la versión ${(mundo.parametrosDesde as number) + 1}` }).click();
});

Cuando('la docente intenta abrir la administración de docentes', async ({ page, mundo }) => {
  await ingresarComoAdulto(page, mundo.aula!.docente.email, mundo.aula!.docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
  await page.goto('/backoffice/docentes');
});

// ── Resultados ───────────────────────────────────────────────────────────────

Entonces('la docente ya no puede ingresar', async ({ page, mundo }) => {
  await salirSiHaySesion(page);
  await ingresarComoAdulto(page, mundo.aula!.docente.email, mundo.aula!.docente.contrasena);
  await expect(page.getByText('Tu cuenta está suspendida. Comunícate con la administración.')).toBeVisible();
});

Entonces('Mateo sigue entrando con su PIN en la tablet del aula', async ({ request, mundo }: { request: APIRequestContext; mundo: Mundo }) => {
  const r = await request.post('/api/v1/acceso-estudiante/login', { data: { tokenDispositivo: mundo.tablet, perfilId: mundo.aula!.estudiantes['Mateo'], pin: PIN_PRUEBA } });
  expect(r.status()).toBe(200);
});

Entonces('la administración ve sus aulas en solo lectura', async ({ page, mundo }) => {
  await ingresarBackoffice(page, mundo.admin!);
  await expect(await filaDocente(page, mundo)).toContainText('Aulas en solo lectura');
});

Entonces('la docente vuelve a ingresar a su panel', async ({ page, mundo }) => {
  await salirSiHaySesion(page);
  await ingresarComoAdulto(page, mundo.aula!.docente.email, mundo.aula!.docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
});

Entonces('Luis recibe un correo para crear su contraseña', async ({ request, mundo }) => {
  expect(await enlaceDeAlta(request, mundo.alta!.email)).toContain('/restablecer?codigo=');
});

Entonces('con ese enlace crea su contraseña e ingresa a su panel de docente', async ({ page, request, mundo }) => {
  await salirSiHaySesion(page);
  const enlace = new URL(await enlaceDeAlta(request, mundo.alta!.email));
  await page.goto(`${enlace.pathname}${enlace.search}`);
  await page.getByLabel('Nueva contraseña').fill('Docente-Nueva-2026');
  await page.getByLabel('Repite la contraseña').fill('Docente-Nueva-2026');
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();
  await expect(page.getByRole('heading', { name: /Contraseña actualizada/ })).toBeVisible();
  await ingresarComoAdulto(page, mundo.alta!.email, 'Docente-Nueva-2026');
  await expect(page).toHaveURL(/\/docente$/);
});

Entonces('la docente no puede crear un aula en ella', async ({ page, mundo }) => {
  await salirSiHaySesion(page);
  await ingresarComoAdulto(page, mundo.aula!.docente.email, mundo.aula!.docente.contrasena);
  await page.getByRole('button', { name: '+ Nueva aula' }).click();
  const formulario = page.getByRole('form', { name: 'Nueva aula' });
  await formulario.getByLabel('Nombre del aula').fill('5.° B');
  await formulario.getByLabel('Institución educativa').fill(mundo.institucion!);
  await formulario.getByLabel('Autoridad que firmó el consentimiento').fill('Dir. Ruiz');
  await formulario.getByRole('checkbox').check();
  await formulario.getByRole('button', { name: 'Crear aula' }).click();
  await expect(formulario.getByText(/está suspendida en LectoAventura/)).toBeVisible();
});

Entonces('ve el cambio con la docente, el estudiante y la dirección IP', async ({ page }) => {
  const fila = page.getByRole('table').getByRole('row').nth(1);
  await expect(fila).toContainText('PIN restablecido');
  await expect(fila).toContainText('(Docente)');
  await expect(fila).toContainText('Estudiante');
  await expect(fila).toContainText(/2001:db8:/);
});

Entonces('queda vigente la versión nueva desde ese momento', async ({ page, mundo }) => {
  const nueva = (mundo.parametrosDesde as number) + 1;
  await expect(page.getByText(`Publicada la versión ${nueva}: se aplica desde ahora. Los logros ya otorgados no cambian.`)).toBeVisible();
  await expect(page.getByText(`Versión vigente: ${nueva}`)).toBeVisible();
});

Entonces('la versión anterior sigue en la lista de versiones', async ({ page, mundo }) => {
  await expect(page.getByRole('list', { name: 'Versiones publicadas' })).toContainText(`Versión ${mundo.parametrosDesde}`);
});

Entonces('vuelve a su panel de docente', async ({ page }) => {
  await expect(page).toHaveURL(/\/docente$/);
});
