import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { APIRequestContext, Download, expect, Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { pinesDelPdf } from '../../../apps/api/test/support/pdf-texto';
import { cuentaVerificada, ingresarComoAdulto } from './iam';

/** Lo que llevan en el título los contenidos de prueba (la limpieza final los borra). */
export const MARCA_CONTENIDO_E2E = 'Prueba E2E';
/** PIN conocido que la docente fija como responsable (RN-03) cuando la prueba no mira el PDF. */
export const PIN_PRUEBA = '4826';

/** Día de Lima (AAAA-MM-DD) a `dias` de hoy: así lo pide el formulario de asignaciones. */
export function diaLima(dias = 0): string {
  return new Date(Date.now() - 5 * 3_600_000 + dias * 86_400_000).toISOString().slice(0, 10);
}

export async function sesionApi(request: APIRequestContext, cuenta: { email: string; contrasena: string }): Promise<Record<string, string>> {
  const login = await request.post('/api/v1/auth/login', { data: cuenta });
  expect(login.status(), await login.text()).toBe(200);
  return { Authorization: `Bearer ${(await login.json()).accessToken}` };
}

export interface AulaPreparada {
  docente: { email: string; contrasena: string };
  aulaId: string;
  aula: string;
  /** Id de cada estudiante por su alias. Todos tienen el PIN_PRUEBA. */
  estudiantes: Record<string, string>;
}

/** Docente con su aula y estudiantes, preparados por la API (RF-014, RF-015). */
export async function docenteConAula(
  request: APIRequestContext,
  /** Por defecto nacidos en abril de 2017 (8–9 años, R2). */
  estudiantes: { alias: string; avatar: string; anioNacimiento?: number }[],
  aula = '3.° B',
): Promise<AulaPreparada> {
  const docente = await cuentaVerificada(request, { rol: 'DOCENTE', nombre: 'Rosa Docente', prefijo: 'docente' });
  const headers = await sesionApi(request, docente);
  const creada = await request.post('/api/v1/aulas', {
    headers,
    data: {
      nombre: aula, grado: '3', anioLectivo: new Date().getFullYear(), institucion: 'IE 1234 Santa Rosa',
      autoridadConsentimiento: 'Directora Ruiz', declaraConsentimiento: true,
    },
  });
  expect(creada.status(), await creada.text()).toBe(201);
  const aulaId = (await creada.json()).id as string;

  const ids: Record<string, string> = {};
  for (const e of estudiantes) {
    const r = await request.post(`/api/v1/aulas/${aulaId}/matriculas`, { headers, data: { anioNacimiento: 2017, mesNacimiento: 4, ...e } });
    expect(r.status(), await r.text()).toBe(201);
    ids[e.alias] = (await r.json()).estudianteId;
    const pin = await request.post(`/api/v1/estudiantes/${ids[e.alias]}/pin/restablecer`, { headers, data: { pinNuevo: PIN_PRUEBA } });
    expect(pin.status()).toBe(200);
  }
  return { docente, aulaId, aula, estudiantes: ids };
}

/** CR-01: activa la tablet del aula por la API y la deja así en este navegador. */
export async function tabletDelAulaActivada(page: Page, request: APIRequestContext, preparada: AulaPreparada): Promise<void> {
  const headers = await sesionApi(request, preparada.docente);
  const r = await request.post(`/api/v1/aulas/${preparada.aulaId}/dispositivos`, { headers, data: { nombre: 'Tablet del aula' } });
  expect(r.status(), await r.text()).toBe(201);
  const { tokenDispositivo } = await r.json();
  await page.addInitScript((token) => localStorage.setItem('lectoaventura.dispositivo', token), tokenDispositivo);
}

/** La docente entra a su panel y abre su aula. */
export async function abrirAula(page: Page, preparada: AulaPreparada): Promise<void> {
  await ingresarComoAdulto(page, preparada.docente.email, preparada.docente.contrasena);
  await expect(page).toHaveURL(/\/docente$/);
  await page.getByRole('link', { name: `Abrir ${preparada.aula}` }).click();
  await expect(page.getByRole('heading', { level: 1, name: preparada.aula })).toBeVisible();
}

function prisma(): PrismaClient {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../apps/api/.env'));
  } catch {
    // En CI la URL de la base llega por variable de entorno.
  }
  return new PrismaClient();
}

/**
 * Una lectura publicada y una misión para asignar (RF-018). Las publicarán los módulos Biblioteca
 * y Aventura; mientras tanto la prueba las crea marcadas como "Prueba E2E" y la limpieza las borra.
 */
export async function sembrarCatalogoE2E(): Promise<{ lectura: string; mision: string }> {
  const lectura = `${MARCA_CONTENIDO_E2E}: El zorro y la luna`;
  const mision = `${MARCA_CONTENIDO_E2E}: El mapa perdido`;
  const db = prisma();
  try {
    if (!(await db.versionLectura.findFirst({ where: { titulo: lectura, estado: 'PUBLICADO' } }))) {
      const autorId = crypto.randomUUID();
      const creada = await db.lectura.create({ data: { autorId } });
      const version = await db.versionLectura.create({
        data: {
          lecturaId: creada.id, numero: 1, estado: 'PUBLICADO', titulo: lectura, rangoEdad: 'R2', nivelDificultad: 2,
          tematica: 'Animales', tipoTexto: 'CUENTO', habilidadesObjetivo: ['LIT', 'INF'], licencia: 'CC BY 4.0',
          texto: 'Había una vez un zorro que miraba la luna.', autorId, revisorId: crypto.randomUUID(), publicadaEn: new Date(),
        },
      });
      await db.lectura.update({ where: { id: creada.id }, data: { versionPublicadaId: version.id } });
    }
    if (!(await db.mision.findFirst({ where: { titulo: mision } }))) {
      const mundo = await db.mundo.findUniqueOrThrow({ where: { numero: 5 }, include: { misiones: { select: { orden: true } } } });
      const libre = [20, 19, 18, 17, 16].find((o) => !mundo.misiones.some((m) => m.orden === o)) as number;
      await db.mision.create({ data: { mundoId: mundo.id, rangoEdad: 'R2', orden: libre, titulo: mision } });
    }
    return { lectura, mision };
  } finally {
    await db.$disconnect();
  }
}

/** Borra los contenidos de prueba (lo llama la limpieza final). */
export async function borrarCatalogoE2E(db: PrismaClient): Promise<void> {
  const versiones = await db.versionLectura.findMany({ where: { titulo: { startsWith: MARCA_CONTENIDO_E2E } }, select: { lecturaId: true } });
  await db.lectura.deleteMany({ where: { id: { in: versiones.map((v) => v.lecturaId) } } });
  await db.mision.deleteMany({ where: { titulo: { startsWith: MARCA_CONTENIDO_E2E } } });
}

/** RF-017: los PIN impresos en el PDF descargado, en el orden de las tarjetas (alfabético). */
export async function pinesDeLaDescarga(descarga: Download): Promise<string[]> {
  return pinesDelPdf(await readFile(await descarga.path()));
}
