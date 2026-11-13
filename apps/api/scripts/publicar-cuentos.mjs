// Publica el contenido inicial (los cuentos de los 5 mundos, prisma/contenido-inicial) en la base LOCAL, por la
// API real del backoffice: la editora escribe, el revisor aprueba (RN-15: revisor ≠ autor) y cada cuento queda en
// su misión del mundo y la edad que le corresponden.
//
// Solo para desarrollo. Usa dos cuentas de contenido (EDITOR y REVISOR) del dominio contenido.lectoaventura.test,
// que la limpieza de las pruebas E2E no borra; en cada ejecución reciben una contraseña y un secreto de MFA nuevos,
// al azar, que no se muestran ni se guardan. Un cuento ya publicado con el mismo texto se salta; si su texto cambió
// (por ejemplo, porque se le agregó su moraleja), recibe una versión nueva (RF-027) que también revisa el revisor.
// Las misiones que ya existen se saltan.
//
// Uso, con la API en marcha:  npm run contenido:publicar --workspace @lectoaventura/api
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { authenticator } from 'otplib';

import { actividadesDe, metadatosDe, textoDe } from '../prisma/contenido-inicial/armar.mjs';
import { CUENTOS } from '../prisma/contenido-inicial/index.mjs';

const RAIZ_API = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
try {
  process.loadEnvFile(resolve(RAIZ_API, '.env'));
} catch {
  // Sin .env se usan las variables del entorno.
}
const API = process.env.API_URL ?? 'http://localhost:3001/api/v1';
const DOMINIO = 'contenido.lectoaventura.test';

function salir(mensaje) {
  console.error(`✖ ${mensaje}`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') salir('Este comando es solo para desarrollo.');
if (!['localhost', '127.0.0.1', '::1'].includes(new URL(process.env.DATABASE_URL ?? 'postgresql://x').hostname)) {
  salir('Solo funciona con una base de datos local.');
}

// Cada pedido sale de una dirección de documentación distinta: el límite de ingresos por IP (RNF-019) no frena la carga.
const ip = () => `2001:db8::${Math.floor(Math.random() * 0x10000).toString(16)}:${Math.floor(Math.random() * 0x10000).toString(16)}`;

async function llamar(metodo, ruta, cuerpo, cabeceras = {}) {
  const r = await fetch(`${API}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip(), ...cabeceras },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  if (!r.ok) salir(`${metodo} ${ruta} respondió ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/** La cuenta de contenido con ese rol (la crea si no existe) y su sesión. */
async function sesionDe(prisma, rol, nombre) {
  const email = `${rol.toLowerCase()}@${DOMINIO}`;
  const contrasena = randomBytes(24).toString('base64url');
  const secreto = authenticator.generateSecret();
  const hashContrasena = await argon2.hash(contrasena, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const cuenta = await prisma.cuenta.upsert({
    where: { email },
    update: { hashContrasena, estado: 'ACTIVA', rol },
    create: { nombre, email, rol, estado: 'ACTIVA', hashContrasena },
  });
  await prisma.factorMfa.upsert({
    where: { cuentaId: cuenta.id },
    update: { habilitado: true, secreto, secretoPendiente: null },
    create: { cuentaId: cuenta.id, habilitado: true, secreto },
  });
  const { accessToken } = await llamar('POST', '/auth/login', { email, contrasena, codigoMfa: authenticator.generate(secreto) });
  return { Authorization: `Bearer ${accessToken}` };
}

const prisma = new PrismaClient();
try {
  const editora = await sesionDe(prisma, 'EDITOR', 'Equipo de contenidos (edición)');
  const revisor = await sesionDe(prisma, 'REVISOR', 'Equipo de contenidos (revisión)');
  const mundos = new Map((await prisma.mundo.findMany({ select: { id: true, numero: true } })).map((m) => [m.numero, m.id]));

  const lecturaDe = new Map();
  const mismoTexto = (a, b) => a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
  let publicados = 0;
  let actualizados = 0;
  for (const c of CUENTOS) {
    const ya = await prisma.versionLectura.findFirst({ where: { titulo: c.titulo, estado: 'PUBLICADO' }, select: { lecturaId: true, texto: true } });
    if (ya) {
      lecturaDe.set(c.clave, ya.lecturaId);
      if (mismoTexto(ya.texto, textoDe(c))) continue;
      // Versión nueva con el texto y las actividades de ahora; si una ejecución anterior la dejó a medias, se retoma.
      const enCurso = await prisma.versionLectura.findFirst({ where: { lecturaId: ya.lecturaId, estado: { in: ['BORRADOR', 'EN_REVISION'] } }, select: { estado: true } });
      if (!enCurso) await llamar('POST', `/backoffice/lecturas/${ya.lecturaId}/nueva-version`, undefined, editora);
      if (enCurso?.estado !== 'EN_REVISION') {
        const { detalle } = await llamar('PUT', `/backoffice/lecturas/${ya.lecturaId}/borrador`, { metadatos: metadatosDe(c), texto: textoDe(c) }, editora);
        await llamar('PUT', `/backoffice/lecturas/${ya.lecturaId}/actividades`, { actividades: actividadesDe(c, detalle.oraciones) }, editora);
        await llamar('POST', `/backoffice/lecturas/${ya.lecturaId}/enviar-revision`, undefined, editora);
      }
      await llamar('POST', `/backoffice/lecturas/${ya.lecturaId}/aprobar`, undefined, revisor);
      actualizados += 1;
      console.log(`↻ ${c.rango} · mundo ${c.mundo} · ${c.titulo} (versión nueva)`);
      continue;
    }
    const { lecturaId, oraciones } = await llamar('POST', '/backoffice/lecturas', { metadatos: metadatosDe(c), texto: textoDe(c) }, editora);
    await llamar('PUT', `/backoffice/lecturas/${lecturaId}/actividades`, { actividades: actividadesDe(c, oraciones) }, editora);
    await llamar('POST', `/backoffice/lecturas/${lecturaId}/enviar-revision`, undefined, editora);
    await llamar('POST', `/backoffice/lecturas/${lecturaId}/aprobar`, undefined, revisor);
    lecturaDe.set(c.clave, lecturaId);
    publicados += 1;
    console.log(`✓ ${c.rango} · mundo ${c.mundo} · ${c.titulo}`);
  }

  let misiones = 0;
  const enOrden = [...CUENTOS].sort((a, b) => a.rango.localeCompare(b.rango) || a.mundo - b.mundo || a.orden - b.orden);
  for (const c of enOrden) {
    const mundoId = mundos.get(c.mundo);
    if (!mundoId) salir(`No existe el mundo ${c.mundo}`);
    const ya = await prisma.mision.findFirst({ where: { mundoId, rangoEdad: c.rango, titulo: c.mision.titulo }, select: { id: true } });
    if (ya) continue;
    await llamar('POST', `/backoffice/mundos/${mundoId}/misiones`, { rangoEdad: c.rango, titulo: c.mision.titulo, descripcion: c.mision.descripcion, lecturaIds: [lecturaDe.get(c.clave)] }, editora);
    misiones += 1;
  }
  console.log(`\nCuentos nuevos: ${publicados}. Con versión nueva: ${actualizados}. Sin cambios: ${CUENTOS.length - publicados - actualizados}. Misiones nuevas: ${misiones}.`);
} finally {
  await prisma.$disconnect();
}
