import { randomBytes } from 'node:crypto';

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID v7 (RFC 9562): 48 bits de milisegundos + 74 bits aleatorios. Ordenado por tiempo, lo que
 * mantiene compactos los índices de PostgreSQL (SRS §7: "identificadores UUID v7").
 */
export function uuidV7(ahoraMs: number = Date.now()): string {
  const b = randomBytes(16);
  let ms = BigInt(ahoraMs);
  for (let i = 5; i >= 0; i--) {
    b[i] = Number(ms & 0xffn);
    ms >>= 8n;
  }
  b[6] = (b[6]! & 0x0f) | 0x70; // versión 7
  b[8] = (b[8]! & 0x3f) | 0x80; // variante RFC 9562
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Las columnas de identificadores son UUID: un id mal formado que llegue desde fuera (URL, cuerpo)
 * no existe. Los repositorios lo usan para responder "no encontrado" sin consultar la base.
 */
export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_UUID.test(valor);
}
