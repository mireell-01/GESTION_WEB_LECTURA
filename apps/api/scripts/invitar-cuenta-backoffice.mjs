// Invita una cuenta del backoffice (EDITOR o REVISOR) SOLO en desarrollo, mientras no exista la
// gestión de usuarios del administrador (RF-076, Módulo 12).
//
// Uso (con la API en marcha):
//   npm run cuenta:backoffice --workspace @lectoaventura/api -- --email ana@ejemplo.pe --nombre "Ana Ríos" --rol EDITOR
//
// La cuenta nace activa con una contraseña aleatoria que nadie conoce y se envía el correo de
// "recuperar contraseña" (RF-004): la persona elige su contraseña desde ese enlace y, al entrar,
// el backoffice le pide configurar la verificación en dos pasos (RF-011). Nunca se escribe ni se
// muestra una contraseña.
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const raiz = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
try {
  process.loadEnvFile(resolve(raiz, '.env'));
} catch {
  // Sin .env se usan las variables del entorno.
}

const argumentos = Object.fromEntries(
  process.argv.slice(2).reduce((pares, valor, i, todos) => (valor.startsWith('--') ? [...pares, [valor.slice(2), todos[i + 1]]] : pares), []),
);
const email = String(argumentos.email ?? '').trim().toLowerCase();
const nombre = String(argumentos.nombre ?? '').trim();
const rol = String(argumentos.rol ?? '').trim().toUpperCase();
const api = process.env.API_URL ?? 'http://localhost:3001/api/v1';

function salir(mensaje) {
  console.error(`✖ ${mensaje}`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') salir('Este comando es solo para desarrollo.');
const base = new URL(process.env.DATABASE_URL ?? 'postgresql://x');
if (!['localhost', '127.0.0.1', '::1'].includes(base.hostname)) salir('Solo funciona con una base de datos local.');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) salir('Indica --email con un correo válido.');
if (nombre.length < 3) salir('Indica --nombre con el nombre y apellido.');
if (!['EDITOR', 'REVISOR'].includes(rol)) salir('Indica --rol EDITOR o --rol REVISOR.');

const prisma = new PrismaClient();
try {
  if (await prisma.cuenta.findUnique({ where: { email } })) salir('Ya existe una cuenta con ese correo.');
  // Contraseña aleatoria de un solo uso interno: nadie la conoce; la persona elige la suya con el enlace.
  const hashContrasena = await argon2.hash(randomBytes(32).toString('base64url'), { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await prisma.cuenta.create({ data: { id: randomUUID(), nombre, email, hashContrasena, rol, estado: 'ACTIVA' } });

  const respuesta = await fetch(`${api}/auth/recuperar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => null);
  console.log(`✔ Cuenta ${rol} creada para ${email}.`);
  if (respuesta?.status === 202) {
    console.log('  Abre http://localhost:3002/dev/correos, usa el enlace "Recupera tu contraseña" para elegir tu contraseña');
    console.log('  y luego entra en http://localhost:3002/ingresar: el backoffice te pedirá configurar la verificación en dos pasos.');
  } else {
    console.log('  La API no respondió: cuando esté en marcha, entra en http://localhost:3002/recuperar con ese correo para elegir tu contraseña.');
  }
} finally {
  await prisma.$disconnect();
}
