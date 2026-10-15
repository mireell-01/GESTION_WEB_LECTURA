import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';

import { DatosAccessToken, TokenService } from '../../application/ports/token.service';
import { PoliticaSesion } from '../../domain/services/politica-sesion';

const EMISOR = 'lectoaventura';

/**
 * Adaptador: JwtTokenService — access tokens JWT HS256 de 15 min (RF-003) y tokens opacos
 * aleatorios (32 bytes) para refresh, dispositivos y enlaces de un solo uso.
 */
export class JwtTokenService implements TokenService {
  constructor(private readonly secreto: string) {
    if (secreto.length < 32) {
      throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    }
  }

  emitirAccessToken(datos: DatosAccessToken): string {
    return jwt.sign({ rol: datos.rol, mfa: datos.mfa, sid: datos.sid }, this.secreto, {
      algorithm: 'HS256',
      subject: datos.sub,
      issuer: EMISOR,
      expiresIn: `${PoliticaSesion.ACCESS_TOKEN_MIN}m`,
    });
  }

  verificarAccessToken(token: string): DatosAccessToken | null {
    try {
      const datos = jwt.verify(token, this.secreto, { algorithms: ['HS256'], issuer: EMISOR }) as jwt.JwtPayload;
      if (typeof datos.sub !== 'string' || typeof datos['sid'] !== 'string' || typeof datos['rol'] !== 'string') {
        return null;
      }
      return { sub: datos.sub, rol: datos['rol'], mfa: datos['mfa'] === true, sid: datos['sid'] };
    } catch {
      return null;
    }
  }

  generarTokenOpaco(): string {
    return randomBytes(32).toString('base64url');
  }

  huella(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
