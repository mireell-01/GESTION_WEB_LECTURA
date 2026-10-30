/** Utilidades de texto del asistente: comparar sin tildes, mayúsculas ni puntuación. */

/** "¡Le dolía ALGO!" → "le dolia algo". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Palabras que no dicen nada por sí solas (para medir cuánto se parece una frase a otra). */
const VACIAS = new Set(
  'el la los las un una unos unas de del al a en y o u que se le les lo su sus por para con sin es era fue son muy mas pero como cuando donde ya no si mi tu yo me te nos este esta ese esa eso esto'.split(
    ' ',
  ),
);

/** Las palabras con contenido de un texto normalizado. */
export function palabrasClave(texto: string): string[] {
  return normalizar(texto)
    .split(' ')
    .filter((p) => p.length > 2 && !VACIAS.has(p));
}
