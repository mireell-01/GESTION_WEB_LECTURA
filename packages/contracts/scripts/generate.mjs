import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Genera tipos TypeScript de ejemplo a partir del OpenAPI 3.1.
 *
 * En producción se sustituye por `openapi-typescript`:
 *   npx openapi-typescript ./openapi/openapi.yaml -o ./src/generated/api-types.ts
 *
 * Este esqueleto deja el pipeline preparado sin requerir la dependencia externa.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(__dirname, '..', 'src', 'generated', 'api-types.ts');

mkdirSync(dirname(outFile), { recursive: true });

const contenido = `/* eslint-disable */
/**
 * ARCHIVO GENERADO — no editar a mano.
 * Fuente: packages/contracts/openapi/openapi.yaml
 * Generado por: packages/contracts/scripts/generate.mjs
 */

export interface DemoRequest {
  [clave: string]: unknown;
}

export interface DemoResponse {
  modulo: string;
  recibido: Record<string, unknown>;
}
`;

writeFileSync(outFile, contenido, 'utf8');
console.log(`Tipos generados en ${outFile}`);
