// Una familia con 6 hijos (el máximo de RF-071), cada uno con su maestría en las 5 habilidades (la que
// Progreso mediría al leer), para el escenario k6 del acompañamiento familiar (scenarios/familia-panel.js,
// RF-068, RF-069, RNF-001). SOLO para desarrollo y CI (ver sembrado.mjs). La familia usa la contraseña
// fija de las cuentas de carga (dominio e2e.lectoaventura.test, que la limpieza de las pruebas E2E borra).
// Imprime solo el correo de la familia.
//
// Uso (con la API en marcha):  node tests/load/sembrar-familia.mjs
import { conPrisma, exigirEntornoLocal, llamar, salir } from './sembrado.mjs';

const CONTRASENA = 'Carga-Lectora-2026-k6';
const HIJOS = ['Lucía', 'Mateo', 'Ana', 'Teo', 'Sara', 'Luis'];
const HABILIDADES = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'];

exigirEntornoLocal();
const email = `carga.familia.${Date.now().toString(36)}@e2e.lectoaventura.test`;
await llamar('POST', '/auth/registro', { nombre: 'Familia Carga', email, contrasena: CONTRASENA, rol: 'FAMILIAR' });
const correo = (await llamar('GET', '/dev/correos')).find((c) => c.para === email);
if (!correo) salir('No llegó el correo de verificación (¿la API corre con la bandeja de desarrollo?).');
await llamar('POST', '/auth/verificar-correo', { codigo: correo.enlace.split('codigo=')[1] });
const { accessToken } = await llamar('POST', '/auth/login', { email, contrasena: CONTRASENA });
const familia = { Authorization: `Bearer ${accessToken}` };

await llamar('POST', '/consentimientos', { otorganteNombre: 'Familia Carga', aceptaPolitica: true }, familia);
const ids = [];
for (const [i, alias] of HIJOS.entries()) {
  const { id } = await llamar('POST', '/estudiantes', { alias, anioNacimiento: 2015 + (i % 3), mesNacimiento: 3, avatar: 'koala', pin: '2580' }, familia);
  ids.push(id);
}

// Maestría variada: cada hijo tiene habilidades por reforzar (consejos y lecturas sugeridas).
await conPrisma(async (prisma) => {
  await prisma.maestriaHabilidad.createMany({
    data: ids.flatMap((estudianteId, i) =>
      HABILIDADES.map((habilidad, j) => ({ estudianteId, habilidad, valor: (i * 11 + j * 17) % 100, itemsContados: 6, actualizadoEn: new Date() })),
    ),
  });
  // Lo que hace el worker de reportes cada 5 minutos.
  await prisma.$executeRawUnsafe('SELECT "reporting"."refrescar_vistas"()');
});
console.log(email);
