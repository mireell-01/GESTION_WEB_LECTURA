import { APIRequestContext, expect, Page } from '@playwright/test';

/** Dominio reservado para datos de prueba: la limpieza final borra todo lo que lo use. */
export const DOMINIO_E2E = 'e2e.lectoaventura.test';
export const CONTRASENA_E2E = 'Prueba-E2E-Lectora-2026';

export function correoUnico(prefijo: string): string {
  return `${prefijo}.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@${DOMINIO_E2E}`;
}

/** IP simulada por prueba: cada prueba se comporta como un dispositivo distinto (RNF-019). */
export function ipSimulada(): string {
  return `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
}

/** Crea y verifica una cuenta por la API (usando la bandeja de correos de desarrollo). */
export async function cuentaVerificada(
  request: APIRequestContext,
  opciones: { rol?: 'FAMILIAR' | 'DOCENTE'; nombre?: string; prefijo?: string } = {},
): Promise<{ email: string; contrasena: string }> {
  const email = correoUnico(opciones.prefijo ?? 'familia');
  const registro = await request.post('/api/v1/auth/registro', {
    data: { nombre: opciones.nombre ?? 'Rosa Prueba', email, contrasena: CONTRASENA_E2E, rol: opciones.rol ?? 'FAMILIAR' },
  });
  expect(registro.status(), await registro.text()).toBe(201);
  const enlace = await enlaceDelCorreo(request, email, /Confirma tu correo/);
  const verificacion = await request.post('/api/v1/auth/verificar-correo', { data: { codigo: new URL(enlace).searchParams.get('codigo') } });
  expect(verificacion.status()).toBe(200);
  return { email, contrasena: CONTRASENA_E2E };
}

/**
 * Prepara por la API un aula con un estudiante matriculado (lo hace un docente, RF-014/RF-015)
 * y devuelve lo que trae la tarjeta de acceso: código de aula, alias y PIN.
 */
export async function aulaConEstudiante(
  request: APIRequestContext,
  estudiante: { alias: string; avatar: string },
): Promise<{ codigoAula: string; alias: string; pin: string }> {
  const { email, contrasena } = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Docente Prueba', prefijo: 'docente' });
  const login = await request.post('/api/v1/auth/login', { data: { email, contrasena } });
  expect(login.status()).toBe(200);
  const headers = { Authorization: `Bearer ${(await login.json()).accessToken}` };
  const aula = await request.post('/api/v1/aulas', {
    headers,
    data: {
      nombre: '3.° B', grado: '3', anioLectivo: new Date().getFullYear(), institucion: 'IE Paucar del Sara Sara',
      autoridadConsentimiento: 'Directora Ruiz', declaraConsentimiento: true,
    },
  });
  expect(aula.status(), await aula.text()).toBe(201);
  const tarjeta = await request.post(`/api/v1/aulas/${(await aula.json()).id}/matriculas`, {
    headers,
    data: { alias: estudiante.alias, anioNacimiento: 2017, mesNacimiento: 4, avatar: estudiante.avatar },
  });
  expect(tarjeta.status(), await tarjeta.text()).toBe(201);
  const t = await tarjeta.json();
  return { codigoAula: t.codigoAula, alias: t.alias, pin: t.pin };
}

export async function enlaceDelCorreo(request: APIRequestContext, email: string, asunto: RegExp): Promise<string> {
  const correos = (await (await request.get('/api/v1/dev/correos')).json()) as { para: string; asunto: string; enlace?: string }[];
  const correo = correos.find((c) => c.para === email && asunto.test(c.asunto));
  expect(correo?.enlace, `No llegó el correo "${asunto}" a ${email}`).toBeTruthy();
  return correo?.enlace as string;
}

export async function ingresarComoAdulto(page: Page, email: string, contrasena: string): Promise<void> {
  await page.goto('/ingresar');
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/** Desde el panel familiar: consentimiento + un perfil + vincular el dispositivo. */
export async function prepararFamilia(page: Page, hijo: { alias: string; avatar: string; pin: string }): Promise<void> {
  await expect(page).toHaveURL(/\/familia$/);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Dar consentimiento' }).click();

  await page.getByRole('button', { name: '+ Agregar perfil' }).click();
  await page.getByLabel('Alias o apodo').fill(hijo.alias);
  await page.getByRole('button', { name: hijo.avatar, exact: true }).click();
  await page.getByLabel('PIN de 4 números').fill(hijo.pin);
  await page.getByLabel('Repite el PIN').fill(hijo.pin);
  await page.getByRole('button', { name: 'Crear perfil' }).click();
  await expect(page.getByRole('heading', { name: hijo.alias })).toBeVisible();

  await page.getByRole('button', { name: 'Vincular este dispositivo' }).click();
  await expect(page.getByText('Este dispositivo está vinculado por 30 días')).toBeVisible();
}

/**
 * URL exacta del área del estudiante. Ojo: /\/estudiante$/ también acepta "/ingresar/estudiante"
 * (la pantalla del PIN), por eso se exige el puerto justo antes de la ruta.
 */
export const URL_AREA_ESTUDIANTE = /:\d+\/estudiante$/;

/** Espera a que el niño esté de verdad dentro de su área (no en la pantalla del PIN). */
export async function esperarAreaEstudiante(page: Page, alias: string): Promise<void> {
  await expect(page).toHaveURL(URL_AREA_ESTUDIANTE);
  await expect(page.getByText(/Tu mapa de aventuras/)).toBeVisible();
  await expect(page.getByRole('banner').getByText(alias)).toBeVisible();
}

/** Teclado de PIN infantil: pulsa cada dígito como lo haría un niño. */
export async function escribirPin(page: Page, pin: string): Promise<void> {
  for (const digito of pin) {
    await page.getByRole('button', { name: digito, exact: true }).click();
  }
}
