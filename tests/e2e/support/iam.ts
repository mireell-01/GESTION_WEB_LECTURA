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
  const registro = await request.post('/api/iam/cuentas', {
    data: { nombre: opciones.nombre ?? 'Rosa Prueba', email, contrasena: CONTRASENA_E2E, rol: opciones.rol ?? 'FAMILIAR' },
  });
  expect(registro.status(), await registro.text()).toBe(201);
  const enlace = await enlaceDelCorreo(request, email, /Confirma tu correo/);
  const verificacion = await request.post('/api/iam/correo/verificar', { data: { codigo: new URL(enlace).searchParams.get('codigo') } });
  expect(verificacion.status()).toBe(200);
  return { email, contrasena: CONTRASENA_E2E };
}

export async function enlaceDelCorreo(request: APIRequestContext, email: string, asunto: RegExp): Promise<string> {
  const correos = (await (await request.get('/api/iam/dev/correos')).json()) as { para: string; asunto: string; enlace?: string }[];
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

/** Teclado de PIN infantil: pulsa cada dígito como lo haría un niño. */
export async function escribirPin(page: Page, pin: string): Promise<void> {
  for (const digito of pin) {
    await page.getByRole('button', { name: digito, exact: true }).click();
  }
}
