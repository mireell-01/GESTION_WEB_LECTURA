// Un aula de 40 estudiantes con su maestría en las 5 habilidades (la que Progreso mediría al leer),
// para el escenario k6 del seguimiento docente (scenarios/seguimiento-panel.js, RNF-003, RF-064, RF-067).
// SOLO para desarrollo y CI (ver sembrado.mjs). La docente usa la contraseña fija de las cuentas de
// carga (dominio e2e.lectoaventura.test, que la limpieza de las pruebas E2E borra).
// Imprime solo "aulaId email".
//
// Uso (con la API en marcha):  node tests/load/sembrar-seguimiento.mjs
import { conPrisma, exigirEntornoLocal, llamar, salir } from './sembrado.mjs';

const CONTRASENA = 'Carga-Lectora-2026-k6';
const ESTUDIANTES = 40;
const AVATARES = ['zorro', 'panda', 'leon', 'rana', 'pulpo', 'buho', 'tortuga', 'unicornio', 'abeja', 'delfin', 'tigre', 'koala'];
const HABILIDADES = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'];

exigirEntornoLocal();
const email = `carga.seguimiento.${Date.now().toString(36)}@e2e.lectoaventura.test`;
await llamar('POST', '/auth/registro', { nombre: 'Docente Carga', email, contrasena: CONTRASENA, rol: 'DOCENTE' });
const correo = (await llamar('GET', '/dev/correos')).find((c) => c.para === email);
if (!correo) salir('No llegó el correo de verificación (¿la API corre con la bandeja de desarrollo?).');
await llamar('POST', '/auth/verificar-correo', { codigo: correo.enlace.split('codigo=')[1] });
const { accessToken } = await llamar('POST', '/auth/login', { email, contrasena: CONTRASENA });
const docente = { Authorization: `Bearer ${accessToken}` };

const aula = await llamar(
  'POST',
  '/aulas',
  { nombre: '4.° Seguimiento carga', grado: '4', anioLectivo: new Date().getFullYear(), institucion: 'IE Carga', autoridadConsentimiento: 'Dir. Carga', declaraConsentimiento: true },
  docente,
);
const csv = Array.from({ length: ESTUDIANTES }, (_, i) => `Lector ${i + 1},2016,${(i % 12) + 1},${AVATARES[i % 12]}`).join('\n');
const { matriculados } = await llamar('POST', `/aulas/${aula.id}/matriculas/importacion`, { csv }, docente);
if (matriculados?.length !== ESTUDIANTES) salir(`No se matricularon los ${ESTUDIANTES} estudiantes de carga.`);

// Maestría repartida entre los 4 niveles CNEB: hay alertas, refuerzos grupales y lecturas sugeridas.
await conPrisma(async (prisma) => {
  await prisma.maestriaHabilidad.createMany({
    data: matriculados.flatMap((m, i) =>
      HABILIDADES.map((habilidad, j) => ({ estudianteId: m.estudianteId, habilidad, valor: (i * 7 + j * 13) % 100, itemsContados: 6, actualizadoEn: new Date() })),
    ),
  });
  // Lo que hace el worker de reportes cada 5 minutos.
  await prisma.$executeRawUnsafe('SELECT "reporting"."refrescar_vistas"()');
});
console.log(`${aula.id} ${email}`);
