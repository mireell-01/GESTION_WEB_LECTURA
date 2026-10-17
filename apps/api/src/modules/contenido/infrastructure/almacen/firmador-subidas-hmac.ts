import { createHmac, timingSafeEqual } from 'node:crypto';

import { FirmadorSubidas } from '../../application/ports/almacen';

/**
 * Adaptador: firma HMAC-SHA256 de las subidas (equivale a la URL prefirmada de S3). El token lleva
 * los datos declarados y su vencimiento; cualquier cambio invalida la firma.
 */
export class FirmadorSubidasHmac implements FirmadorSubidas {
  constructor(private readonly secreto: string) {
    if (secreto.length < 32) throw new Error('El secreto de firma necesita al menos 32 caracteres');
  }

  firmar(datos: Record<string, unknown>, expiraEn: Date): string {
    const cuerpo = Buffer.from(JSON.stringify({ ...datos, exp: expiraEn.getTime() })).toString('base64url');
    return `${cuerpo}.${this.firma(cuerpo)}`;
  }

  verificar(token: string, ahora: Date): Record<string, unknown> | null {
    const [cuerpo, firma] = token.split('.');
    if (!cuerpo || !firma) return null;
    const esperada = Buffer.from(this.firma(cuerpo));
    const recibida = Buffer.from(firma);
    if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
    try {
      const { exp, ...datos } = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as Record<string, unknown>;
      return typeof exp === 'number' && ahora.getTime() < exp ? datos : null;
    } catch {
      return null;
    }
  }

  private firma(cuerpo: string): string {
    return createHmac('sha256', this.secreto).update(`subidas:${cuerpo}`).digest('base64url');
  }
}
