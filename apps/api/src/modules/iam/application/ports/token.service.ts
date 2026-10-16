/** Contenido firmado del access token. */
export interface DatosAccessToken {
  sub: string;
  rol: string;
  mfa: boolean;
  sid: string;
}

/**
 * Puerto de salida: TokenService — access tokens firmados (15 min) y tokens opacos
 * (refresh, dispositivo, enlaces) de los que solo se guarda la huella.
 */
export interface TokenService {
  emitirAccessToken(datos: DatosAccessToken): string;
  verificarAccessToken(token: string): DatosAccessToken | null;
  /** Token aleatorio criptográficamente seguro. */
  generarTokenOpaco(): string;
  /** Huella determinista (SHA-256) para buscar un token opaco sin guardarlo en claro. */
  huella(token: string): string;
}
