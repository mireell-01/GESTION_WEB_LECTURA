// Siembra misiones para el escenario k6 de Aventura (scenarios/aventura-mapa.js): 3 misiones de
// 8–9 años en cada mundo, cada una con 2 lecturas publicadas de esa edad (RF-032).
// SOLO para desarrollo y CI (ver sembrado.mjs).
//
// Uso (con la API en marcha):  node tests/load/sembrar-aventura.mjs
import { conPrisma, cuentaBackoffice, exigirEntornoLocal, llamar, publicarLecturas } from './sembrado.mjs';

const MISIONES_POR_MUNDO = 3;
const LECTURAS_POR_MISION = 2;

exigirEntornoLocal();
await conPrisma(async (prisma) => {
  const editora = await cuentaBackoffice(prisma, 'EDITOR');
  const revisor = await cuentaBackoffice(prisma, 'REVISOR');
  const mundos = await llamar('GET', '/backoffice/mundos', undefined, editora);
  const lecturas = await publicarLecturas(editora, revisor, mundos.length * MISIONES_POR_MUNDO * LECTURAS_POR_MISION, { prefijo: 'Misión de carga', rangoEdad: 'R2' });
  let i = 0;
  for (const mundo of mundos) {
    for (let m = 1; m <= MISIONES_POR_MUNDO; m++) {
      const lecturaIds = lecturas.slice(i, i + LECTURAS_POR_MISION);
      i += LECTURAS_POR_MISION;
      await llamar('POST', `/backoffice/mundos/${mundo.id}/misiones`, { rangoEdad: 'R2', titulo: `Carga ${mundo.numero}.${m}`, lecturaIds }, editora);
    }
  }
});
console.log(`✔ ${MISIONES_POR_MUNDO} misiones por mundo (8–9 años) para la prueba de carga de Aventura.`);
