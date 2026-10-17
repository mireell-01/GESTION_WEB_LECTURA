import { inflateSync } from 'node:zlib';

/**
 * Textos dibujados en un PDF generado con pdf-lib (fuentes estándar): descomprime cada stream y
 * lee los operadores `Tj`. Sirve para comprobar lo que verá impreso la docente (p. ej. el PIN).
 */
export function textosDelPdf(pdf: Buffer): string[] {
  const textos: string[] = [];
  for (const m of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let datos = Buffer.from(m[1] ?? '', 'latin1');
    try {
      datos = inflateSync(datos);
    } catch {
      // stream sin comprimir
    }
    const contenido = datos.toString('latin1');
    for (const h of contenido.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) textos.push(Buffer.from(h[1] ?? '', 'hex').toString('latin1'));
    for (const p of contenido.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) textos.push(p[1] ?? '');
  }
  return textos;
}

/** Cada tarjeta dibuja su PIN dígito por dígito: reconstruye los PIN en orden de aparición. */
export function pinesDelPdf(pdf: Buffer): string[] {
  const textos = textosDelPdf(pdf);
  const pines: string[] = [];
  for (let i = 0; i + 3 < textos.length; i++) {
    const cuatro = textos.slice(i, i + 4);
    if (textos[i - 1] === 'Mi PIN' && cuatro.every((t) => /^\d$/.test(t))) pines.push(cuatro.join(''));
  }
  return pines;
}
