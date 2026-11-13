/** Lo que Google (OpenID Connect) confirma de una persona, ya validado (firma, emisor, audiencia, vigencia y nonce). */
export interface IdentidadGoogle {
  /** Identificador estable de la cuenta de Google (no cambia aunque cambie el correo). */
  sub: string;
  email: string;
  emailVerificado: boolean;
  nombre: string | null;
}

/**
 * Puerto de salida: el proveedor de identidad de Google, con el flujo de código de autorización y PKCE.
 * En desarrollo y en las pruebas lo reemplaza un "Google de prueba" que nunca existe en producción.
 */
export interface ProveedorGoogle {
  readonly modo: 'GOOGLE' | 'SIMULADO';
  /** A dónde se envía el navegador para elegir la cuenta (el reto PKCE se calcula del verificador). */
  urlAutorizacion(p: { state: string; nonce: string; codeVerifier: string; pista?: string }): string;
  /** Canjea el código por el ID token, lo valida y devuelve la identidad. Lanza un error si algo no cuadra. */
  canjearCodigo(p: { codigo: string; codeVerifier: string; nonce: string }): Promise<IdentidadGoogle>;
}
