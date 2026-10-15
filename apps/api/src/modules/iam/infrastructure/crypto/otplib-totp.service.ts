import { authenticator } from 'otplib';

import { TotpService } from '../../application/ports/totp.service';

// Acepta el código del intervalo anterior/siguiente (±30 s) por desfases de reloj.
authenticator.options = { window: 1 };

/** Adaptador: OtplibTotpService — TOTP RFC 6238 compatible con Google/Microsoft Authenticator. */
export class OtplibTotpService implements TotpService {
  generarSecreto(): string {
    return authenticator.generateSecret();
  }

  urlConfiguracion(email: string, secreto: string): string {
    return authenticator.keyuri(email, 'LectoAventura', secreto);
  }

  verificar(secreto: string, codigo: string): boolean {
    if (!/^\d{6}$/.test(codigo)) return false;
    try {
      return authenticator.verify({ token: codigo, secret: secreto });
    } catch {
      return false;
    }
  }
}
