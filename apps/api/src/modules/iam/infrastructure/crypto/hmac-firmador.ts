import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { FirmadorEnlaces } from '../../application/ports/exportaciones';

/**
 * Adaptador: HmacFirmador — firma HMAC-SHA256 de enlaces de descarga (RF-012).
 * Usa una clave derivada del secreto de la API, distinta de la que firma los JWT.
 */
export class HmacFirmador implements FirmadorEnlaces {
  private readonly clave: Buffer;

  constructor(secreto: string, proposito: string) {
    this.clave = createHash('sha256').update(`${proposito}:${secreto}`).digest();
  }

  firmar(texto: string): string {
    return createHmac('sha256', this.clave).update(texto).digest('base64url');
  }

  /** Comparación en tiempo constante para no filtrar la firma por diferencias de tiempo. */
  verificar(texto: string, firma: string): boolean {
    const esperada = Buffer.from(this.firmar(texto));
    const recibida = Buffer.from(firma ?? '');
    return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
  }
}
