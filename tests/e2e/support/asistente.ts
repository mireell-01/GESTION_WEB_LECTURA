import { resolve } from 'node:path';

import { APIRequestContext, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { FamiliaPreparada } from './familia';
import { escribirPin, esperarAreaEstudiante } from './iam';
import { ENUNCIADOS } from './lectura';

/**
 * Ayudantes del Módulo 11 (asistente de lectura): la familia lo activa por la API, el niño entra en la
 * tablet de casa y llega a la primera pregunta de "Killa y la llama", y lo que quedó guardado.
 */

/** RF-072: la familia que creó el perfil activa el asistente de su hijo. */
export async function activarAsistente(request: APIRequestContext, familia: FamiliaPreparada, estudianteId: string): Promise<void> {
  const r = await request.put(`/api/v1/familia/estudiantes/${estudianteId}/asistente`, { headers: familia.headers, data: { activo: true } });
  expect(r.status(), await r.text()).toBe(200);
}

/** El niño entra con su PIN en la tablet de casa y llega a la inferencia de Killa (tras su predicción). */
export async function ninoEnLaPregunta(page: Page, request: APIRequestContext, familia: FamiliaPreparada, alias: string, lecturaId: string): Promise<void> {
  const r = await request.post('/api/v1/familia/dispositivos', { headers: familia.headers, data: { nombre: 'Tablet de casa' } });
  expect(r.status(), await r.text()).toBe(201);
  const { tokenDispositivo } = await r.json();
  await page.addInitScript((token) => localStorage.setItem('lectoaventura.dispositivo', token), tokenDispositivo);
  await page.goto('/');
  await page.getByRole('button', { name: alias }).click();
  await escribirPin(page, '2580');
  await esperarAreaEstudiante(page, alias);
  await page.goto(`/estudiante/lecturas/${lecturaId}`);
  await page.getByLabel('Lo que creo que pasará').fill('Creo que la llama se enfermará');
  await page.getByRole('button', { name: 'Empezar a leer' }).click();
  await expect(page.getByRole('heading', { level: 2, name: ENUNCIADOS.seleccion, exact: true })).toBeVisible();
}

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/** RN-16: los textos que quedaron guardados de las conversaciones del niño. */
export async function turnosGuardados(estudianteId: string): Promise<string[]> {
  const prisma = db();
  try {
    const turnos = await prisma.turno.findMany({ where: { conversacion: { estudianteId } }, orderBy: { orden: 'asc' } });
    return turnos.map((t) => t.texto);
  } finally {
    await prisma.$disconnect();
  }
}
