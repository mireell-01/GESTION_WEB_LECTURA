import { createHash } from 'node:crypto';

/**
 * Identificador determinista con formato UUID (versión 8, RFC 9562) para los logros que no traen un
 * id propio (una subida de nivel, una racha, un mundo): el mismo logro produce siempre el mismo id,
 * y el libro de puntos lo rechaza si llega dos veces (UNIQUE evento_origen + motivo).
 */
export function idDeterminista(...partes: string[]): string {
  const b = createHash('sha256').update(partes.join('\u001f')).digest().subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x80; // versión 8
  b[8] = (b[8]! & 0x3f) | 0x80; // variante RFC 9562
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
