// Mide la cobertura de condiciones de unos archivos con unas pruebas (Semana 12):
//   C_condiciones = (operandos evaluados en verdadero y en falso) / (total de operandos × 2) × 100
//
// Uso, desde apps/api (sin argumentos mide la maestría con su suite de caja negra):
//   npm run test:condiciones
//   npm run test:condiciones -- --pruebas test/unit/x.spec.ts --archivos src/modules/a.ts,src/modules/b.ts [--filtro "Caja negra"]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const AQUI = dirname(fileURLToPath(import.meta.url));
const API = resolve(AQUI, '../../..');
const SALIDA = resolve(API, 'reports/condiciones');

const argumentos = process.argv.slice(2);
const valor = (nombre, porDefecto) => {
  const i = argumentos.indexOf(`--${nombre}`);
  return i >= 0 ? argumentos[i + 1] : porDefecto;
};
const pruebas = valor('pruebas', 'test/unit/progreso/dominio/maestria-caja-negra.spec.ts');
const archivos = valor('archivos', 'src/modules/progreso/domain/services/maestria.ts,src/modules/shared-kernel/domain/value-objects/nivel-cneb.ts')
  .split(',')
  .map((a) => a.replace(/^src\//, ''));
const filtro = valor('filtro', '');

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });
const r = spawnSync(`npx vitest run -c "${resolve(AQUI, 'vitest.config.mjs')}" ${filtro ? `-t "${filtro}"` : ''}`, {
  cwd: API,
  shell: true,
  encoding: 'utf8',
  maxBuffer: 1 << 26,
  env: { ...process.env, PRUEBAS: pruebas, ARCHIVOS_MEDIDOS: archivos.join(','), CONDICIONES_SALIDA: SALIDA },
});
const texto = stripVTControlCharacters(`${r.stdout}${r.stderr}`);
const meta = readdirSync(SALIDA)
  .filter((f) => f.startsWith('meta-'))
  .flatMap((f) => JSON.parse(readFileSync(resolve(SALIDA, f), 'utf8')));
if (meta.length === 0) {
  console.error(texto.slice(-2000));
  console.error('No se instrumentó ninguna condición: revisa --archivos.');
  process.exit(1);
}
const cuentas = {};
for (const f of readdirSync(SALIDA).filter((x) => x.startsWith('resultado-'))) {
  for (const [id, c] of Object.entries(JSON.parse(readFileSync(resolve(SALIDA, f), 'utf8')))) {
    const k = (cuentas[id] ??= { verdadero: 0, falso: 0 });
    k.verdadero += c.verdadero;
    k.falso += c.falso;
  }
}
let logradas = 0;
const filas = meta.map((m) => {
  const c = cuentas[m.id] ?? { verdadero: 0, falso: 0 };
  logradas += (c.verdadero > 0 ? 1 : 0) + (c.falso > 0 ? 1 : 0);
  return { ...m, ...c };
});
const total = meta.length * 2;
console.log(texto.split(/\r?\n/).filter((l) => /^\s+(Tests|Test Files) /.test(l)).join('\n'));
console.log(`\nCobertura de condiciones: ${logradas} de ${total} salidas (${meta.length} operandos × 2) = ${((100 * logradas) / total).toFixed(2)} %\n`);
for (const f of filas) {
  const falta = [f.verdadero ? '' : 'verdadero', f.falso ? '' : 'falso'].filter(Boolean).join(' y ');
  console.log(`  ${`${f.archivo}:${f.linea}`.padEnd(52)} ${f.condicion.padEnd(40)} V=${String(f.verdadero).padStart(4)}  F=${String(f.falso).padStart(4)}${falta ? `   FALTA ${falta}` : ''}`);
}
writeFileSync(resolve(SALIDA, 'resumen.json'), JSON.stringify({ pruebas, archivos, filtro, logradas, total, filas }, null, 2));
process.exit(r.status === 0 && logradas === total ? 0 : 1);
