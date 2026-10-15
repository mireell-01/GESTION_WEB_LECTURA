/**
 * Puerto de salida: HashService — criptografía de contraseñas y PIN.
 * Implementado con bcrypt/argon2 en infrastructure; el dominio no conoce el algoritmo.
 */
export interface HashService {
  hash(plain: string): Promise<string>;
  verificar(plain: string, hash: string): Promise<boolean>;
}
