import { resolve } from 'node:path';

import { APIRequestContext, expect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { AulaPreparada, PIN_PRUEBA, sesionApi } from './escuela';

function db(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/** La respuesta correcta y la habilidad de un ítem del banco (para acertar o fallar a propósito). */
export async function claveDelItem(itemId: string): Promise<{ indice: number; habilidad: string; opciones: string[] }> {
  const prisma = db();
  try {
    const item = await prisma.bancoItemDiagnostico.findUniqueOrThrow({ where: { id: itemId } });
    return { indice: (item.respuestaCorrecta as { indice: number }).indice, habilidad: item.habilidad, opciones: (item.contenido as { opciones: string[] }).opciones };
  } finally {
    await prisma.$disconnect();
  }
}

/** Igual que claveDelItem, pero buscando la pregunta por su enunciado (lo que el niño ve en pantalla). */
export async function claveDelEnunciado(enunciado: string, rangoEdad = 'R2'): Promise<{ correcta: string; incorrecta: string; habilidad: string }> {
  const prisma = db();
  try {
    const item = await prisma.bancoItemDiagnostico.findFirstOrThrow({ where: { enunciado, rangoEdad } });
    const opciones = (item.contenido as { opciones: string[] }).opciones;
    const indice = (item.respuestaCorrecta as { indice: number }).indice;
    return { correcta: opciones[indice] as string, incorrecta: opciones[(indice + 1) % opciones.length] as string, habilidad: item.habilidad };
  } finally {
    await prisma.$disconnect();
  }
}

/** Sesión del niño por la API, con otra tablet del aula (registrar una tablet no invalida las demás). */
export async function sesionDelNino(request: APIRequestContext, preparada: AulaPreparada, alias: string): Promise<Record<string, string>> {
  const headers = await sesionApi(request, preparada.docente);
  const tablet = await request.post(`/api/v1/aulas/${preparada.aulaId}/dispositivos`, { headers, data: { nombre: 'Tablet de prueba' } });
  expect(tablet.status(), await tablet.text()).toBe(201);
  const login = await request.post('/api/v1/acceso-estudiante/login', {
    data: { tokenDispositivo: (await tablet.json()).tokenDispositivo, perfilId: preparada.estudiantes[alias], pin: PIN_PRUEBA },
  });
  expect(login.status(), await login.text()).toBe(200);
  return { Authorization: `Bearer ${(await login.json()).accessToken}` };
}

/**
 * RN-05: un niño nuevo hace su reto antes de ver el mapa. Lo completa por la API acertando solo en
 * las habilidades indicadas (por defecto ninguna: empieza en el mundo 1, RF-033). Sirve igual para
 * el reto inicial y para un reto de repaso pendiente.
 */
export async function retoTerminado(request: APIRequestContext, preparada: AulaPreparada, alias: string, acertar: string[] = []): Promise<void> {
  const nino = await sesionDelNino(request, preparada, alias);
  const comenzar = await request.post('/api/v1/diagnosticos', { headers: nino });
  expect(comenzar.status(), await comenzar.text()).toBe(201);
  const { id } = await comenzar.json();
  for (;;) {
    const { item } = await (await request.get(`/api/v1/diagnosticos/${id}/siguiente-item`, { headers: nino })).json();
    if (!item) break;
    const clave = await claveDelItem(item.itemId);
    const indice = acertar.includes(clave.habilidad) ? clave.indice : (clave.indice + 1) % clave.opciones.length;
    expect((await request.post(`/api/v1/diagnosticos/${id}/respuestas`, { headers: nino, data: { itemId: item.itemId, indice } })).status()).toBe(200);
  }
  expect((await request.post(`/api/v1/diagnosticos/${id}/finalizar`, { headers: nino })).status()).toBe(200);
}
