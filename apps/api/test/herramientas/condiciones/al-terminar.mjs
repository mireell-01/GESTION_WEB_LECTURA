// Al terminar cada archivo de pruebas guarda lo que contó __cond (un archivo por proceso).
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll } from 'vitest';

const SALIDA = process.env['CONDICIONES_SALIDA'];

afterAll(() => {
  writeFileSync(resolve(SALIDA, `resultado-${process.pid}-${Date.now()}.json`), JSON.stringify(globalThis.__condiciones ?? {}));
});
