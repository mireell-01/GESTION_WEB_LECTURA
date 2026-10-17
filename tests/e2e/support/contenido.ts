import { resolve } from 'node:path';

import { APIRequestContext, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { authenticator } from 'otplib';

import { CONTRASENA_E2E, correoUnico } from './iam';

export interface CuentaBackoffice {
  email: string;
  contrasena: string;
  /** Secreto TOTP de su app autenticadora (RF-011), para calcular el código como lo haría su celular. */
  secreto: string;
}

/**
 * Cuenta de editor o revisor con MFA activo. Las crea el administrador (RF-076, Módulo 12); mientras
 * tanto la prueba la siembra en la base, en el dominio de pruebas que la limpieza final borra.
 */
export async function cuentaBackoffice(rol: 'EDITOR' | 'REVISOR'): Promise<CuentaBackoffice> {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  const prisma = new PrismaClient();
  try {
    const email = correoUnico(rol.toLowerCase());
    const secreto = authenticator.generateSecret();
    const cuenta = await prisma.cuenta.create({
      data: {
        nombre: rol === 'EDITOR' ? 'Elena Editora' : 'Raúl Revisor',
        email,
        rol,
        estado: 'ACTIVA',
        hashContrasena: await argon2.hash(CONTRASENA_E2E, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
      },
    });
    await prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
    return { email, contrasena: CONTRASENA_E2E, secreto };
  } finally {
    await prisma.$disconnect();
  }
}

/** Ingreso al backoffice: correo, contraseña y el código de 6 dígitos de la app autenticadora. */
export async function ingresarBackoffice(page: Page, cuenta: CuentaBackoffice): Promise<void> {
  await page.goto('/ingresar');
  await page.getByLabel('Correo electrónico').fill(cuenta.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(cuenta.contrasena);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByLabel('Código de 6 dígitos').fill(authenticator.generate(cuenta.secreto));
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/backoffice$/);
}

export async function sesionBackoffice(request: APIRequestContext, cuenta: CuentaBackoffice): Promise<Record<string, string>> {
  const login = await request.post('/api/v1/auth/login', {
    data: { email: cuenta.email, contrasena: cuenta.contrasena, codigoMfa: authenticator.generate(cuenta.secreto) },
  });
  expect(login.status(), await login.text()).toBe(200);
  return { Authorization: `Bearer ${(await login.json()).accessToken}` };
}

export const TEXTO_E2E = [
  'Había una vez un zorro que miraba la luna cada noche. Quería tocarla con su nariz.',
  'Una tarde subió al cerro más alto. ¡Qué cerca parecía! Pero la luna seguía lejos.',
].join('\n');

/** Lectura completa publicada por la API (editora escribe, revisor aprueba): para preparar escenarios. */
export async function lecturaPublicada(
  request: APIRequestContext,
  metadatos: Partial<{ titulo: string; rangoEdad: string; nivelDificultad: number; tematica: string }>,
): Promise<{ lecturaId: string; titulo: string }> {
  const editora = await sesionBackoffice(request, await cuentaBackoffice('EDITOR'));
  const revisor = await sesionBackoffice(request, await cuentaBackoffice('REVISOR'));
  const datos = {
    titulo: 'El zorro y la luna', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', tipoTexto: 'CUENTO',
    habilidadesObjetivo: ['LIT', 'INF'], licencia: 'CC BY 4.0', ...metadatos,
  };
  const creada = await request.post('/api/v1/backoffice/lecturas', { headers: editora, data: { metadatos: datos, texto: TEXTO_E2E } });
  expect(creada.status(), await creada.text()).toBe(201);
  const { lecturaId, oraciones } = await creada.json();
  const actividades = await request.put(`/api/v1/backoffice/lecturas/${lecturaId}/actividades`, {
    headers: editora,
    data: {
      actividades: [{
        momento: 'DESPUES', tipo: 'EVIDENCIA',
        items: [{
          habilidad: 'INF', nivelDificultad: 2, modalidad: 'EVIDENCIA', enunciado: 'Marca dónde se ve que la luna estaba lejos',
          clavesEvidencia: [oraciones[4].id], explicacionModelada: 'La última oración lo dice.', pistas: [{ nivel: 'P1', texto: 'Busca en el segundo párrafo.' }],
        }],
      }],
    },
  });
  expect(actividades.status(), await actividades.text()).toBe(200);
  expect((await request.post(`/api/v1/backoffice/lecturas/${lecturaId}/enviar-revision`, { headers: editora })).status()).toBe(200);
  expect((await request.post(`/api/v1/backoffice/lecturas/${lecturaId}/aprobar`, { headers: revisor })).status()).toBe(200);
  return { lecturaId, titulo: datos.titulo };
}

/**
 * La biblioteca muestra 12 lecturas por página en orden alfabético: con las que publican otras
 * pruebas, una lectura concreta puede quedar en la página 2. Cada prueba le da una temática única
 * y filtra por ella.
 */
export async function filtrarPorTema(page: Page, tema: string): Promise<void> {
  await page.getByLabel('Temática').fill(tema);
  await page.getByRole('button', { name: 'Buscar' }).click();
}
