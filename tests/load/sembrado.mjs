// Utilidades de sembrado para las pruebas de carga (solo desarrollo y CI). Las cuentas EDITOR y
// REVISOR no se crean desde la API pública, así que se crean en la base (con MFA) y luego todo se
// publica por la API real, con el mismo flujo que usa el equipo de contenidos (RF-021 a RF-026).
// Las contraseñas y los secretos de MFA se generan al azar en memoria y no se muestran. Todo queda
// en el dominio e2e.lectoaventura.test, que la limpieza de las pruebas E2E borra.
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { PrismaClient } from '@prisma/client';

const raiz = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
try {
  process.loadEnvFile(resolve(raiz, 'apps/api/.env'));
} catch {
  // Sin .env (CI) se usan las variables del entorno.
}

export const API = process.env.API_URL ?? 'http://localhost:3001/api/v1';

export function salir(mensaje) {
  console.error(`✖ ${mensaje}`);
  process.exit(1);
}

/** Nunca contra producción ni contra una base que no sea local. */
export function exigirEntornoLocal() {
  if (process.env.NODE_ENV === 'production') salir('Este comando es solo para desarrollo y CI.');
  if (!['localhost', '127.0.0.1', '::1'].includes(new URL(process.env.DATABASE_URL ?? 'postgresql://x').hostname)) {
    salir('Solo funciona con una base de datos local.');
  }
}

const ip = () => `2001:db8::${Math.floor(Math.random() * 0x10000).toString(16)}:${Math.floor(Math.random() * 0x10000).toString(16)}`;

export async function llamar(metodo, ruta, cuerpo, cabeceras = {}) {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip(), ...cabeceras },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!r.ok) salir(`${metodo} ${ruta} respondió ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/** Cuenta EDITOR o REVISOR con MFA y su sesión (cabecera Authorization). */
export async function cuentaBackoffice(prisma, rol) {
  const email = `carga.${rol.toLowerCase()}.${Date.now().toString(36)}${randomBytes(2).toString('hex')}@e2e.lectoaventura.test`;
  const contrasena = randomBytes(24).toString('base64url');
  const secreto = authenticator.generateSecret();
  const hashContrasena = await argon2.hash(contrasena, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const cuenta = await prisma.cuenta.create({ data: { nombre: `Carga ${rol}`, email, rol, estado: 'ACTIVA', hashContrasena } });
  await prisma.factorMfa.create({ data: { cuentaId: cuenta.id, habilitado: true, secreto } });
  const { accessToken } = await llamar('POST', '/auth/login', { email, contrasena, codigoMfa: authenticator.generate(secreto) });
  return { Authorization: `Bearer ${accessToken}` };
}

const TEXTO = 'Había una vez un zorro que miraba la luna. Quería tocarla con su nariz.\nUna tarde subió al cerro más alto. Pero la luna seguía lejos.';
const TEMAS = ['Animales', 'Ciencia', 'Amistad'];

/** Publica `cantidad` lecturas (editora → revisor) y devuelve sus ids. */
export async function publicarLecturas(editora, revisor, cantidad, { prefijo = 'Carga', rangoEdad } = {}) {
  const ids = [];
  for (let i = 0; i < cantidad; i++) {
    const { lecturaId, oraciones } = await llamar(
      'POST',
      '/backoffice/lecturas',
      {
        metadatos: {
          titulo: `${prefijo} ${String(i + 1).padStart(3, '0')}`,
          rangoEdad: rangoEdad ?? ['R1', 'R2', 'R3'][i % 3],
          nivelDificultad: (i % 5) + 1,
          tematica: TEMAS[i % 3],
          tipoTexto: 'CUENTO',
          habilidadesObjetivo: ['INF'],
          licencia: 'CC BY 4.0',
        },
        texto: TEXTO,
      },
      editora,
    );
    await llamar(
      'PUT',
      `/backoffice/lecturas/${lecturaId}/actividades`,
      {
        actividades: [
          {
            momento: 'DESPUES',
            tipo: 'EVIDENCIA',
            items: [
              {
                habilidad: 'INF',
                nivelDificultad: 2,
                modalidad: 'EVIDENCIA',
                enunciado: 'Marca la oración que lo demuestra',
                clavesEvidencia: [oraciones[3].id],
                explicacionModelada: 'La última oración lo dice.',
                pistas: [{ nivel: 'P1', texto: 'Busca en el segundo párrafo.' }],
              },
            ],
          },
        ],
      },
      editora,
    );
    await llamar('POST', `/backoffice/lecturas/${lecturaId}/enviar-revision`, {}, editora);
    await llamar('POST', `/backoffice/lecturas/${lecturaId}/aprobar`, {}, revisor);
    ids.push(lecturaId);
  }
  return ids;
}

/** Ejecuta `tarea(prisma)` con un cliente de Prisma que se cierra al terminar. */
export async function conPrisma(tarea) {
  const prisma = new PrismaClient();
  try {
    return await tarea(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
