// Siembra lecturas publicadas para el escenario k6 de la biblioteca (scenarios/biblioteca.js).
// SOLO para desarrollo y CI (ver sembrado.mjs).
//
// Uso (con la API en marcha):  node tests/load/sembrar-biblioteca.mjs [cantidad]   (por defecto 30)
import { conPrisma, cuentaBackoffice, exigirEntornoLocal, publicarLecturas } from './sembrado.mjs';

const CANTIDAD = Math.min(Math.max(Number(process.argv[2] ?? 30) || 30, 1), 200);

exigirEntornoLocal();
await conPrisma(async (prisma) => {
  const editora = await cuentaBackoffice(prisma, 'EDITOR');
  const revisor = await cuentaBackoffice(prisma, 'REVISOR');
  await publicarLecturas(editora, revisor, CANTIDAD);
});
console.log(`✔ ${CANTIDAD} lecturas publicadas para la prueba de carga de la biblioteca.`);
