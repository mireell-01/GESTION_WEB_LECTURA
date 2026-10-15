import * as argon2 from 'argon2';

import { HashService } from '../../application/ports/hash.service';

/** RNF-017: Argon2id con m = 19 MiB, t = 2, p = 1 (parámetros mínimos recomendados por OWASP). */
export const PARAMETROS_ARGON2 = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/**
 * Adaptador: Argon2HashService — hash de contraseñas y PIN. Cada hash lleva su propia sal
 * y sus parámetros; nunca se guarda el valor en claro.
 */
export class Argon2HashService implements HashService {
  async hash(plano: string): Promise<string> {
    return argon2.hash(plano, PARAMETROS_ARGON2);
  }

  async verificar(plano: string, hash: string): Promise<boolean> {
    if (!hash) return false;
    try {
      return await argon2.verify(hash, plano);
    } catch {
      return false;
    }
  }
}
