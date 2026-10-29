import { APIRequestContext, expect } from '@playwright/test';

import { AulaPreparada, sesionApi } from './escuela';
import { cuentaVerificada } from './iam';

/**
 * Ayudantes del Módulo 10 (acompañamiento familiar): familias preparadas por la API, hijos propios o
 * acompañados por invitación de su docente, y el resumen del domingo sin esperar al domingo.
 */
export interface FamiliaPreparada {
  email: string;
  contrasena: string;
  headers: Record<string, string>;
}

/** Una familia verificada que ya dio su consentimiento (RF-005). */
export async function familiaConConsentimiento(request: APIRequestContext, prefijo = 'familia'): Promise<FamiliaPreparada> {
  const cuenta = await cuentaVerificada(request, { prefijo, nombre: 'Carmen Prueba' });
  const headers = await sesionApi(request, cuenta);
  const r = await request.post('/api/v1/consentimientos', { headers, data: { otorganteNombre: 'Carmen Prueba', aceptaPolitica: true } });
  expect(r.status(), await r.text()).toBe(201);
  return { ...cuenta, headers };
}

/** Un hijo propio de la familia (RF-071), de 9 años. */
export async function hijoDeFamilia(request: APIRequestContext, familia: FamiliaPreparada, alias: string, avatar = 'koala'): Promise<string> {
  const r = await request.post('/api/v1/estudiantes', {
    headers: familia.headers,
    data: { alias, anioNacimiento: new Date().getFullYear() - 9, mesNacimiento: 3, avatar, pin: '2580' },
  });
  expect(r.status(), await r.text()).toBe(201);
  return (await r.json()).id;
}

/** RF-019: la docente invita a la familia y esta canjea el código; desde entonces lo acompaña. */
export async function acompanarDesdeElAula(request: APIRequestContext, aula: AulaPreparada, alias: string, familia: FamiliaPreparada): Promise<void> {
  const docente = await sesionApi(request, aula.docente);
  const invitacion = await request.post(`/api/v1/estudiantes/${aula.estudiantes[alias]}/invitaciones-familiar`, { headers: docente });
  expect(invitacion.status(), await invitacion.text()).toBe(201);
  const vinculo = await request.post('/api/v1/familia/vincular', { headers: familia.headers, data: { codigo: (await invitacion.json()).codigo } });
  expect(vinculo.status(), await vinculo.text()).toBe(201);
}

/** El próximo domingo a las 18:30 de Lima (`semanas` después). */
export function domingoALas1830(semanas = 0): string {
  const lima = new Date(Date.now() - 5 * 3_600_000);
  const dias = (7 - lima.getUTCDay()) % 7 + 7 * semanas;
  return new Date(Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate() + dias, 23, 30)).toISOString();
}

/** Lo que hace el worker de reportes, como si fuera `ahora` (solo desarrollo y CI: sin SMTP real). */
export async function ejecutarReportes(request: APIRequestContext, ahora: string): Promise<{ docentes: number; familias: number }> {
  const r = await request.post('/api/v1/dev/reportes/ejecutar', { data: { ahora } });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}

/** Los resúmenes semanales que recibió la familia (bandeja de correos de desarrollo), del más reciente al más antiguo. */
export async function resumenesDe(request: APIRequestContext, email: string): Promise<{ asunto: string; texto: string; bajaUrl?: string }[]> {
  const correos = (await (await request.get('/api/v1/dev/correos')).json()) as { para: string; asunto: string; texto: string; bajaUrl?: string }[];
  return correos.filter((c) => c.para === email && c.asunto.startsWith('Resumen semanal: así'));
}

/** La ruta de la página de baja con un clic que trae el correo (sin el dominio). */
export function enlaceDeBaja(texto: string): string {
  const url = /(\S+\/resumen-familiar\/baja\?token=\S+)/.exec(texto)?.[1];
  expect(url, 'el correo trae el enlace de baja').toBeTruthy();
  const u = new URL(url as string);
  return `${u.pathname}${u.search}`;
}
