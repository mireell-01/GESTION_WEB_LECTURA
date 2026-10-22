/**
 * RF-041: filtro de palabras no apropiadas en lo que escriben (o dictan) los niños. Compara sin
 * tildes ni mayúsculas, y con las sustituciones típicas (0→o, 4→a, @→a…); la palabra se reemplaza
 * por asteriscos y el resto del texto queda igual. La lista se amplía aquí, en un solo lugar.
 * Quedan fuera palabras con otro sentido en los cuentos ("la zorra", "la perra", "una concha").
 */
const PROHIBIDAS = [
  'idiota', 'imbecil', 'estupido', 'estupida', 'tarado', 'tarada', 'mierda', 'carajo', 'cojudo', 'cojuda', 'huevon', 'huevona',
  'webon', 'webona', 'cabron', 'cabrona', 'pendejo', 'pendeja', 'puta', 'puto', 'maricon', 'marica', 'conchatumare',
  'conchatumadre', 'ctm', 'csm', 'chucha', 'verga', 'pinga', 'joder', 'jodete', 'malparido', 'malparida', 'hdp', 'cagada',
  'culero', 'culo',
];

/** Variantes que se aceptan de cada palabra: plural y diminutivo/aumentativo sencillos. */
const SUFIJOS = ['', 's', 'es', 'ito', 'ita', 'itos', 'itas', 'azo', 'aza'];

const SUSTITUCIONES: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's' };

function normal(palabra: string): string {
  return palabra
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => SUSTITUCIONES[c] as string)
    .replace(/(.)\1+/g, '$1'); // "idiotaaa" → "idiota"
}

const BUSCADAS = new Set(PROHIBIDAS.flatMap((p) => SUFIJOS.map((s) => normal(p + s))));

/** Palabra: letras (con tildes), dígitos y los símbolos que se usan para disfrazarlas. */
const PALABRA = /[\p{L}\p{N}@$]+/gu;

export function filtrarPalabras(texto: string): { texto: string; filtrado: boolean } {
  let filtrado = false;
  const limpio = texto.replace(PALABRA, (p) => {
    if (!BUSCADAS.has(normal(p))) return p;
    filtrado = true;
    return '*'.repeat(Math.max(3, p.length));
  });
  return { texto: limpio, filtrado };
}

export function palabrasDe(texto: string): number {
  return texto.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
}
