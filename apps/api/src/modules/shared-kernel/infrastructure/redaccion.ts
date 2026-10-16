/**
 * RNF-031: ningún log puede contener PIN, contraseñas, tokens ni secretos.
 * `redactar` enmascara lo que tenga forma de secreto antes de escribir un mensaje en el log.
 */
const CAMPOS_SECRETOS =
  'pin|pinNuevo|contrasena|contrasenaNueva|password|codigo|codigoMfa|refreshToken|accessToken|tokenDispositivo|hashPin|hashContrasena|hashRefreshToken|hashToken|mfaSecret|mfaSecretPendiente|secreto|firma';

const REGLAS: [RegExp, string][] = [
  // "campo": "valor" · campo=valor · campo: valor
  [new RegExp(`("?(?:${CAMPOS_SECRETOS})"?\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;}&]+)`, 'gi'), '$1"[REDACTADO]"'],
  // Parámetros de enlaces de un solo uso y descargas firmadas.
  [/([?&](?:codigo|firma|token)=)[^&\s"']+/gi, '$1[REDACTADO]'],
  // Cookie del refresh token.
  [/(la_refresh=)[^;\s]+/gi, '$1[REDACTADO]'],
  // JWT (cabecera.cuerpo.firma).
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[JWT]'],
  // Hashes argon2.
  [/\$argon2(?:id|i|d)\$[^\s"',]+/g, '[HASH]'],
  // Huellas SHA-256 y tokens opacos de 32 bytes en base64url.
  [/\b[0-9a-f]{64}\b/gi, '[HUELLA]'],
  [/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g, '[TOKEN]'],
];

export function redactar(texto: string): string {
  return REGLAS.reduce((acumulado, [patron, reemplazo]) => acumulado.replace(patron, reemplazo), texto);
}
