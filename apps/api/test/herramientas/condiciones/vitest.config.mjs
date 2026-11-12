// Cobertura de CONDICIONES: cada operando booleano evaluado en verdadero y en falso. v8 no la reporta (solo
// sentencias, ramas, funciones y líneas), así que este plugin instrumenta al vuelo los archivos medidos: cada
// condición atómica de un if, de un ternario o de un && / || pasa por __cond(id, valor), que cuenta las veces
// que salió verdadera y falsa. Lo usa medir.mjs; no forma parte de las suites.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const AQUI = dirname(fileURLToPath(import.meta.url));
const API = resolve(AQUI, '../../..');
const SALIDA = process.env['CONDICIONES_SALIDA'] ?? resolve(API, 'reports/condiciones');
const ts = createRequire(import.meta.url)('typescript');
const OBJETIVOS = (process.env['ARCHIVOS_MEDIDOS'] ?? '').split(',').filter(Boolean);

function instrumentar(codigo, archivo) {
  const corto = archivo.replace(/.*\/modules\//, '');
  const sf = ts.createSourceFile(archivo, codigo, ts.ScriptTarget.Latest, true);
  const logico = (n) =>
    ts.isBinaryExpression(n) &&
    (n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || n.operatorToken.kind === ts.SyntaxKind.BarBarToken);
  const sinParentesis = (n) => (ts.isParenthesizedExpression(n) ? sinParentesis(n.expression) : n);
  const atomicas = new Map();
  const hojas = (n) => {
    const x = sinParentesis(n);
    if (logico(x)) {
      hojas(x.left);
      hojas(x.right);
    } else atomicas.set(x.getStart(sf), x);
  };
  const visitar = (n) => {
    if (ts.isIfStatement(n)) hojas(n.expression);
    else if (ts.isConditionalExpression(n)) hojas(n.condition);
    else if (logico(n) && !logico(sinParentesis(n.parent))) hojas(n);
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  const meta = [];
  let salida = codigo;
  for (const n of [...atomicas.values()].sort((a, b) => b.getStart(sf) - a.getStart(sf))) {
    const inicio = n.getStart(sf);
    const fin = n.getEnd();
    const linea = sf.getLineAndCharacterOfPosition(inicio).line + 1;
    const condicion = codigo.slice(inicio, fin);
    const id = `${corto}:${linea}:${condicion}`;
    meta.push({ id, archivo: corto, linea, condicion });
    salida = `${salida.slice(0, inicio)}__cond(${JSON.stringify(id)}, ${salida.slice(inicio, fin)})${salida.slice(fin)}`;
  }
  writeFileSync(resolve(SALIDA, `meta-${corto.replace(/[^a-zA-Z0-9]+/g, '_')}.json`), JSON.stringify(meta.reverse(), null, 2));
  const ayudante =
    'const __cond = (id: string, v: unknown): boolean => { const g = globalThis as unknown as { __condiciones?: Record<string, { verdadero: number; falso: number }> }; const r = (g.__condiciones ??= {}); const k = (r[id] ??= { verdadero: 0, falso: 0 }); if (v) k.verdadero += 1; else k.falso += 1; return Boolean(v); };\n';
  return ayudante + salida;
}

const condiciones = {
  name: 'cobertura-de-condiciones',
  enforce: 'pre',
  transform(codigo, id) {
    const ruta = id.replace(/\\/g, '/');
    if (!OBJETIVOS.some((o) => ruta.endsWith(o))) return null;
    return { code: instrumentar(codigo, ruta), map: null };
  },
};

export default defineConfig({
  root: API,
  plugins: [condiciones, swc.vite({ module: { type: 'es6' } })],
  test: {
    include: (process.env['PRUEBAS'] ?? '').split(',').filter(Boolean),
    exclude: ['**/node_modules/**', ...(process.env['EXCLUIR'] ?? '').split(',').filter(Boolean)],
    environment: 'node',
    globals: true,
    setupFiles: [resolve(AQUI, 'al-terminar.mjs')],
  },
});
