import { expect } from '@playwright/test';

import {
  activarTabletDelAula,
  aulaConEstudiante,
  CONTRASENA_E2E,
  correoUnico,
  cuentaSinVerificar,
  cuentaVerificada,
  enlaceDelCorreo,
  escribirPin,
  ingresarComoAdulto,
  prepararFamilia,
  retrocederEnlacesDeVerificacion,
  salirDelPanel,
  URL_AREA_ESTUDIANTE,
} from '../support/iam';
import { Cuando, Dado, Entonces } from './fixtures';

/** Nivel 4 — Definición de pasos (Step Definitions) de los escenarios de IAM en español. */

// ── Registro y acceso ─────────────────────────────────────────────────────

Dado('que estoy en la página de registro', async ({ page }) => {
  await page.goto('/registro');
});

async function registrarme(page: import('@playwright/test').Page, mundo: { email?: string; contrasena?: string }, nombre: string, contrasena: string) {
  mundo.email = correoUnico('uat');
  mundo.contrasena = contrasena;
  await page.getByRole('button', { name: /Familiar/ }).click();
  await page.getByLabel('Nombre y apellido').fill(nombre);
  await page.getByLabel('Correo electrónico').fill(mundo.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await page.getByLabel('Repite la contraseña').fill(contrasena);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
}

Cuando(
  'me registro como familiar con el nombre {string}, un correo nuevo y una contraseña segura',
  async ({ page, mundo }, nombre: string) => {
    await registrarme(page, mundo, nombre, CONTRASENA_E2E);
    await expect(page.getByRole('heading', { name: /Revisa tu correo/ })).toBeVisible();
  },
);

Cuando(
  'me registro como familiar con el nombre {string}, un correo nuevo y la contraseña {string}',
  async ({ page, mundo }, nombre: string, contrasena: string) => {
    await registrarme(page, mundo, nombre, contrasena);
  },
);

Cuando('abro el enlace de verificación que me llegó por correo', async ({ page, request, mundo }) => {
  const enlace = new URL(await enlaceDelCorreo(request, mundo.email as string, /Confirma tu correo/));
  await page.goto(enlace.pathname + enlace.search);
  await expect(page.getByRole('heading', { name: /Correo verificado/ })).toBeVisible();
});

Cuando('ingreso con mi correo y mi contraseña', async ({ page, mundo }) => {
  await ingresarComoAdulto(page, mundo.email as string, mundo.contrasena as string);
});

// ── Reenvío del enlace de verificación (RF-002) ───────────────────────────

Dado('que me registré pero perdí el correo de confirmación', async ({ request, mundo }) => {
  Object.assign(mundo, await cuentaSinVerificar(request, 'uat'));
  await retrocederEnlacesDeVerificacion(mundo.email as string);
});

Entonces('veo el aviso {string}', async ({ page }, aviso: string) => {
  await expect(page.getByText(aviso)).toBeVisible();
});

Cuando('pido un nuevo enlace de verificación', async ({ page }) => {
  await page.getByRole('button', { name: 'Reenviar enlace de verificación' }).click();
  await expect(page.getByText(/te enviamos un enlace nuevo/)).toBeVisible();
});

Cuando('abro el enlace más reciente', async ({ page, request, mundo }) => {
  const enlace = new URL(await enlaceDelCorreo(request, mundo.email as string, /Confirma tu correo/));
  await page.goto(enlace.pathname + enlace.search);
});

Entonces('veo mi panel familiar con el saludo {string}', async ({ page }, saludo: string) => {
  await expect(page).toHaveURL(/\/familia$/);
  await expect(page.getByRole('heading', { name: new RegExp(saludo) })).toBeVisible();
});

Dado('que tengo una cuenta familiar verificada', async ({ request, mundo }) => {
  Object.assign(mundo, await cuentaVerificada(request, { prefijo: 'uat' }));
});

Cuando('intento ingresar con una contraseña equivocada', async ({ page, mundo }) => {
  await ingresarComoAdulto(page, mundo.email as string, 'no-es-mi-contraseña');
});

Entonces('veo el mensaje {string}', async ({ page }, mensaje: string) => {
  await expect(page.getByRole('alert').filter({ hasText: mensaje })).toBeVisible();
});

Entonces('sigo en la pantalla de ingreso', async ({ page }) => {
  await expect(page).toHaveURL(/\/ingresar/);
});

// ── Consentimiento y perfil ───────────────────────────────────────────────

Dado('que ingresé con mi cuenta familiar verificada', async ({ page, request, mundo }) => {
  Object.assign(mundo, await cuentaVerificada(request, { prefijo: 'uat' }));
  await ingresarComoAdulto(page, mundo.email as string, mundo.contrasena as string);
  await expect(page).toHaveURL(/\/familia$/);
});

Entonces('se me pide dar mi consentimiento antes de agregar perfiles', async ({ page }) => {
  await expect(page.getByRole('heading', { name: /tu consentimiento/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dar consentimiento' })).toBeDisabled();
});

Entonces('no puedo agregar perfiles todavía', async ({ page }) => {
  await expect(page.getByRole('button', { name: '+ Agregar perfil' })).toHaveCount(0);
});

Cuando('doy mi consentimiento como adulto responsable', async ({ page }) => {
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Dar consentimiento' }).click();
  await expect(page.getByRole('heading', { name: /Mis hijos/ })).toBeVisible();
});

Cuando('abro el formulario para agregar un perfil', async ({ page }) => {
  await page.getByRole('button', { name: '+ Agregar perfil' }).click();
});

Entonces('el formulario solo pide alias, mes y año de nacimiento, avatar y PIN', async ({ page }) => {
  const formulario = page.locator('form').filter({ has: page.getByLabel('Alias o apodo') });
  const etiquetas = (await formulario.locator('label.la-campo__etiqueta, legend').allInnerTexts()).map((t) => t.trim());
  expect(etiquetas).toEqual(['Alias o apodo', 'Mes de nacimiento', 'Año de nacimiento', 'Avatar', 'PIN de 4 números', 'Repite el PIN']);
  // RN-02: nada de apellidos, documento, foto, correo ni teléfono del menor.
  await expect(formulario.locator('input[type="email"], input[type="file"], input[type="tel"]')).toHaveCount(0);
});

Cuando(
  'creo el perfil de {string} con el avatar {string} y el PIN {string}',
  async ({ page }, alias: string, avatar: string, pin: string) => {
    await page.getByLabel('Alias o apodo').fill(alias);
    await page.getByRole('button', { name: avatar, exact: true }).click();
    await page.getByLabel('PIN de 4 números').fill(pin);
    await page.getByLabel('Repite el PIN').fill(pin);
    await page.getByRole('button', { name: 'Crear perfil' }).click();
  },
);

Entonces('veo la tarjeta de {string} con la edad {string}', async ({ page }, alias: string, edad: string) => {
  const tarjeta = page.locator('article').filter({ has: page.getByRole('heading', { name: alias }) });
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta.getByText(edad)).toBeVisible();
});

// ── Ingreso del estudiante ────────────────────────────────────────────────

Dado(
  'que mi familia vinculó esta tablet y creó mi perfil {string} con el avatar {string} y el PIN {string}',
  async ({ page, request }, alias: string, avatar: string, pin: string) => {
    const { email, contrasena } = await cuentaVerificada(request, { prefijo: 'uat' });
    await ingresarComoAdulto(page, email, contrasena);
    await prepararFamilia(page, { alias, avatar, pin });
    await salirDelPanel(page);
    await page.goto('/ingresar/estudiante');
  },
);

// ── Tablet del aula sin códigos (CR-01) ───────────────────────────────────

Dado('que soy docente del aula {string} con la estudiante {string}', async ({ request, mundo }, aula: string, alias: string) => {
  mundo.tarjeta = await aulaConEstudiante(request, { alias, avatar: 'buho' });
  expect(mundo.tarjeta.aula).toBe(aula);
});

Cuando('activo esta tablet para el aula {string} y la dejo lista para los niños', async ({ page, mundo }, aula: string) => {
  await activarTabletDelAula(page, mundo.tarjeta!.docente, aula);
});

Entonces('la tablet muestra los avatares del {string} sin pedir ningún código', async ({ page, mundo }, contexto: string) => {
  await expect(page.getByText(contexto)).toBeVisible();
  await expect(page.getByRole('button', { name: mundo.tarjeta!.alias })).toBeVisible();
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

Cuando('escribo el PIN de su tarjeta', async ({ page, mundo }) => {
  await escribirPin(page, mundo.tarjeta!.pin);
});

Dado('que abro la app en una tablet que nadie activó', async ({ page }) => {
  await page.goto('/ingresar/estudiante');
});

Entonces('veo el título {string}', async ({ page }, titulo: string) => {
  await expect(page.getByRole('heading', { name: titulo, level: 1 })).toBeVisible();
});

Entonces('no aparece ningún avatar ni campo para escribir códigos', async ({ page }) => {
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '¿Quién va a leer hoy?' })).toHaveCount(0);
});

Cuando('toco mi avatar {string}', async ({ page }, alias: string) => {
  await page.getByRole('button', { name: alias }).click();
  await expect(page.getByRole('heading', { name: `¡Hola, ${alias}!` })).toBeVisible();
});

Cuando('escribo el PIN {string}', async ({ page }, pin: string) => {
  await escribirPin(page, pin);
});

Cuando('escribo {int} veces el PIN equivocado {string}', async ({ page }, veces: number, pin: string) => {
  for (let i = 1; i <= veces; i++) {
    await escribirPin(page, pin);
    if (i < veces) await expect(page.getByRole('alert').filter({ hasText: `Te quedan ${5 - i} intentos` })).toBeVisible();
  }
});

Cuando('intento abrir el panel familiar', async ({ page }) => {
  await expect(page).toHaveURL(URL_AREA_ESTUDIANTE);
  await page.goto('/familia');
});

Entonces(
  /^(?:llego a|vuelvo a) mi área de lectura con el saludo "(.+)"$/,
  async ({ page }, saludo: string) => {
    await expect(page).toHaveURL(URL_AREA_ESTUDIANTE);
    // El inicio del niño muestra su mapa de aventuras (RF-030) bajo el título "Tus mundos".
    await expect(page.getByRole('heading', { name: 'Tus mundos', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: saludo })).toBeVisible();
  },
);

Cuando('nadie toca la tablet durante {int} minutos', async ({ page }, minutos: number) => {
  await page.clock.fastForward(`${String(minutos).padStart(2, '0')}:10`);
});

Entonces('vuelvo a la pantalla de ingreso con el aviso {string}', async ({ page }, aviso: string) => {
  await expect(page).toHaveURL(/\/ingresar\/estudiante\?motivo=inactividad$/);
  await expect(page.getByText(aviso)).toBeVisible();
});
