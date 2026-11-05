import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * La guardia de las suites priorizadas. Las etiquetas y los barriles se escriben a mano, así que sin esta
 * prueba se desordenan en silencio: un archivo nuevo quedaría fuera de la suite Core y nadie lo notaría.
 * También impide "arreglar" la puerta rápida bajando a [Menor] una prueba de una regla crítica.
 */
const TEST = resolve(__dirname, '../..');
const ETIQUETA = /^\[([A-Za-z]+)\]\[(Core|Menor)\]\[(Fast|Slow)\] /;
const DESCRIBE = /^describe(?:\.\w+)?\('((?:[^'\\]|\\.)*)'/gm;
const ESTA_GUARDIA = 'unit/suites/etiquetas.spec.ts';

/** Las reglas de negocio que nunca salen de Core: privacidad y acceso de los menores, calificación y publicación. */
const REGLAS_CRITICAS = ['RN-01', 'RN-02', 'RN-03', 'RN-04', 'RN-06', 'RN-07', 'RN-14', 'RN-15', 'RN-16', 'RN-17'];

interface Bloque {
  archivo: string;
  titulo: string;
  componente: string | undefined;
  riesgo: string | undefined;
  tiempo: string | undefined;
}

function especificaciones(carpeta: string, sufijo: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return especificaciones(ruta, sufijo);
    return nombre.endsWith(sufijo) ? [relative(TEST, ruta).replace(/\\/g, '/')] : [];
  });
}

function bloques(archivo: string): Bloque[] {
  const texto = readFileSync(join(TEST, archivo), 'utf8');
  return [...texto.matchAll(DESCRIBE)].map(([, titulo = '']) => {
    const [, componente, riesgo, tiempo] = ETIQUETA.exec(titulo) ?? [];
    return { archivo, titulo, componente, riesgo, tiempo };
  });
}

/** Lo que importa un barril, como ruta relativa a test/ con la extensión del archivo. */
function importados(barril: string): string[] {
  const ruta = join(TEST, 'suites', barril);
  const texto = readFileSync(ruta, 'utf8');
  return [...texto.matchAll(/^import '([^']+)';/gm)]
    .map(([, destino = '']) => `${relative(TEST, resolve(dirname(ruta), destino)).replace(/\\/g, '/')}.ts`)
    .sort();
}

const UNITARIAS = especificaciones(join(TEST, 'unit'), '.spec.ts');
const INTEGRACION = especificaciones(join(TEST, 'integration'), '.int-spec.ts');
const carpetaDe = (archivo: string) => archivo.split('/')[1];
const conEtiqueta = (pred: (b: Bloque) => boolean) => UNITARIAS.filter((a) => a !== ESTA_GUARDIA && bloques(a).some(pred));

describe('[Suites][Core][Fast] Etiquetas y barriles de las suites priorizadas', () => {
  it('cada describe de primer nivel lleva [Componente][Core|Menor][Fast|Slow], con el componente de su carpeta', () => {
    for (const archivo of [...UNITARIAS, ...INTEGRACION]) {
      const lista = bloques(archivo);
      expect(lista.length, `Sin describe de primer nivel: ${archivo}`).toBeGreaterThan(0);
      for (const b of lista) {
        expect(b.componente, `Sin etiqueta válida en ${archivo}: ${b.titulo}`).toBeDefined();
        expect(b.componente?.toLowerCase(), `Componente distinto a su carpeta: ${b.titulo}`).toBe(carpetaDe(archivo));
      }
    }
  });

  it('todas las pruebas de integración son [Slow] y un archivo no mezcla riesgos (sus describe dependen de la Preparación)', () => {
    for (const archivo of INTEGRACION) {
      const lista = bloques(archivo);
      expect(new Set(lista.map((b) => b.tiempo)), archivo).toEqual(new Set(['Slow']));
      expect(new Set(lista.map((b) => b.riesgo)).size, archivo).toBe(1);
    }
  });

  it('la suite Core importa exactamente los archivos con algún describe [Core], y a esta guardia', () => {
    expect(importados('core.suite.test.ts')).toEqual([...conEtiqueta((b) => b.riesgo === 'Core'), ESTA_GUARDIA].sort());
  });

  it('la suite Fast importa exactamente los archivos con algún describe [Fast], y a esta guardia', () => {
    expect(importados('fast.suite.test.ts')).toEqual([...conEtiqueta((b) => b.tiempo === 'Fast'), ESTA_GUARDIA].sort());
  });

  it('la suite Slow importa exactamente los archivos con algún describe [Slow]', () => {
    expect(importados('slow.suite.test.ts')).toEqual(conEtiqueta((b) => b.tiempo === 'Slow').sort());
  });

  it('cada componente tiene su suite con todos sus archivos', () => {
    const carpetas = [...new Set(UNITARIAS.map(carpetaDe))].filter((c) => c !== 'suites');
    for (const carpeta of carpetas) {
      const suyos = UNITARIAS.filter((a) => carpetaDe(a) === carpeta).sort();
      expect(importados(`componentes/${carpeta}.suite.test.ts`), carpeta).toEqual(suyos);
    }
  });

  it('anti-degradación: toda prueba que nombra una regla crítica sigue en [Core]', () => {
    const todos = [...UNITARIAS, ...INTEGRACION].flatMap(bloques);
    for (const regla of REGLAS_CRITICAS) {
      const conLaRegla = todos.filter((b) => b.titulo.includes(regla));
      expect(conLaRegla.length, `Ningún describe nombra ${regla}`).toBeGreaterThan(0);
      for (const b of conLaRegla) expect(b.riesgo, `${regla} en ${b.archivo}: ${b.titulo}`).toBe('Core');
    }
  });
});
