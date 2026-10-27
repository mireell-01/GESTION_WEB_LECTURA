import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import { esUuid } from '../../shared-kernel/public-api';
import { FirmaBaja } from '../application/ports/familia.ports';

/**
 * Adaptador: HmacFirmaBaja — el enlace de baja del resumen semanal (RF-070) lleva la cuenta y su firma
 * HMAC-SHA256 con una clave derivada del secreto de la API, distinta de la de los JWT y de las demás
 * firmas: solo sirve para cambiar esta preferencia.
 */
export class HmacFirmaBaja implements FirmaBaja {
  private readonly clave: Buffer;

  constructor(secreto: string) {
    if (!secreto) throw new Error('Falta el secreto para firmar los enlaces de baja (JWT_SECRET)');
    this.clave = createHash('sha256').update(`baja-resumen-familiar:${secreto}`).digest();
  }

  private firma(cuentaId: string): string {
    return createHmac('sha256', this.clave).update(cuentaId).digest('base64url');
  }

  token(cuentaId: string): string {
    return `${cuentaId}.${this.firma(cuentaId)}`;
  }

  /** Comparación en tiempo constante para no filtrar la firma por diferencias de tiempo. */
  cuentaDe(token: string): string | null {
    const [cuentaId = '', firma = '', ...resto] = String(token ?? '').split('.');
    if (resto.length > 0 || !esUuid(cuentaId)) return null;
    const esperada = Buffer.from(this.firma(cuentaId));
    const recibida = Buffer.from(firma);
    return esperada.length === recibida.length && timingSafeEqual(esperada, recibida) ? cuentaId : null;
  }
}
