import { createHash, createPublicKey, KeyObject, verify } from 'node:crypto';

import { IdentidadGoogle, ProveedorGoogle } from '../../application/ports/proveedor-google';

/** Dónde vive cada parte del proveedor (Google real o el de prueba) y con qué credenciales se habla con él. */
export interface ConfigOidc {
  modo: 'GOOGLE' | 'SIMULADO';
  clientId: string;
  clientSecret: string;
  /** La vuelta, en el mismo origen que la web (que reenvía /api a la API): así la cookie de sesión es de primera parte. */
  redirectUri: string;
  urlAutorizacion: string;
  urlToken: string;
  urlJwks: string;
  emisores: string[];
}

/** Los extremos públicos de Google (descubrimiento de OpenID: accounts.google.com/.well-known/openid-configuration). */
export const EXTREMOS_GOOGLE = {
  urlAutorizacion: 'https://accounts.google.com/o/oauth2/v2/auth',
  urlToken: 'https://oauth2.googleapis.com/token',
  urlJwks: 'https://www.googleapis.com/oauth2/v3/certs',
  emisores: ['https://accounts.google.com', 'accounts.google.com'],
};

/** Margen para relojes un poco desfasados al validar la vigencia del ID token. */
const MARGEN_RELOJ_S = 60;
/** Las llaves de Google rotan cada pocas semanas: se guardan una hora y se vuelven a pedir si llega una nueva. */
const VIGENCIA_LLAVES_MS = 60 * 60_000;

/** PKCE (RFC 7636): el reto S256 es el SHA-256 del verificador, en base64url. */
export function retoPkce(verificador: string): string {
  return createHash('sha256').update(verificador).digest('base64url');
}

interface Reclamos {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  nonce?: string;
  exp?: number;
  iat?: number;
}

/**
 * Adaptador: OidcGoogle — OpenID Connect con el flujo de código de autorización y PKCE (RFC 7636). Valida el ID
 * token como pide la especificación: firma RS256 con las llaves públicas del proveedor (JWKS), emisor, audiencia
 * (nuestro client_id), vigencia y el nonce de este viaje. Sin dependencias: `fetch` y `node:crypto`.
 */
export class OidcGoogle implements ProveedorGoogle {
  private llaves: { hasta: number; porKid: Map<string, KeyObject> } | null = null;

  constructor(
    private readonly config: ConfigOidc,
    private readonly pedir: typeof fetch = fetch,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  get modo(): 'GOOGLE' | 'SIMULADO' {
    return this.config.modo;
  }

  urlAutorizacion(p: { state: string; nonce: string; codeVerifier: string; pista?: string }): string {
    const url = new URL(this.config.urlAutorizacion);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: p.state,
      nonce: p.nonce,
      code_challenge: retoPkce(p.codeVerifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
      ...(p.pista ? { login_hint: p.pista } : {}),
    }).toString();
    return url.toString();
  }

  async canjearCodigo(p: { codigo: string; codeVerifier: string; nonce: string }): Promise<IdentidadGoogle> {
    const respuesta = await this.pedir(this.config.urlToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: p.codigo,
        code_verifier: p.codeVerifier,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
      }).toString(),
    });
    if (!respuesta.ok) throw new Error(`El proveedor rechazó el código (${respuesta.status})`);
    const { id_token: idToken } = (await respuesta.json()) as { id_token?: unknown };
    if (typeof idToken !== 'string') throw new Error('El proveedor no devolvió un ID token');
    const r = await this.validar(idToken, p.nonce);
    return {
      sub: r.sub as string,
      email: (r.email ?? '').trim().toLowerCase(),
      emailVerificado: r.email_verified === true || r.email_verified === 'true',
      nombre: r.name?.trim() || null,
    };
  }

  private async validar(jwt: string, nonce: string): Promise<Reclamos> {
    const partes = jwt.split('.');
    if (partes.length !== 3) throw new Error('ID token mal formado');
    const [cabeceraB64, cuerpoB64, firmaB64] = partes as [string, string, string];
    const cabecera = JSON.parse(Buffer.from(cabeceraB64, 'base64url').toString('utf8')) as { alg?: string; kid?: string };
    // Solo RS256: nunca "none" ni algoritmos simétricos elegidos por quien envía el token.
    if (cabecera.alg !== 'RS256' || !cabecera.kid) throw new Error('Algoritmo o llave no admitidos');
    const llave = await this.llave(cabecera.kid);
    const firmaValida = verify('RSA-SHA256', Buffer.from(`${cabeceraB64}.${cuerpoB64}`), llave, Buffer.from(firmaB64, 'base64url'));
    if (!firmaValida) throw new Error('Firma del ID token inválida');

    const r = JSON.parse(Buffer.from(cuerpoB64, 'base64url').toString('utf8')) as Reclamos;
    const ahoraS = Math.floor(this.ahora().getTime() / 1000);
    const audiencias = Array.isArray(r.aud) ? r.aud : [r.aud];
    if (!r.iss || !this.config.emisores.includes(r.iss)) throw new Error('Emisor no reconocido');
    if (!audiencias.includes(this.config.clientId)) throw new Error('El ID token no es para esta aplicación');
    if (typeof r.exp !== 'number' || r.exp + MARGEN_RELOJ_S < ahoraS) throw new Error('El ID token venció');
    if (typeof r.iat === 'number' && r.iat - MARGEN_RELOJ_S > ahoraS) throw new Error('El ID token viene del futuro');
    if (!r.nonce || r.nonce !== nonce) throw new Error('El nonce no corresponde a este ingreso');
    if (!r.sub) throw new Error('El ID token no identifica a la persona');
    return r;
  }

  private async llave(kid: string): Promise<KeyObject> {
    const vigentes = this.llaves && this.llaves.hasta > this.ahora().getTime() ? this.llaves : null;
    const conocida = vigentes?.porKid.get(kid);
    if (conocida) return conocida;
    // Llave nueva (rotación) o caché vencida: se vuelven a pedir.
    const respuesta = await this.pedir(this.config.urlJwks, { headers: { Accept: 'application/json' } });
    if (!respuesta.ok) throw new Error(`No se pudieron leer las llaves del proveedor (${respuesta.status})`);
    const { keys } = (await respuesta.json()) as { keys?: (Record<string, unknown> & { kid?: string; kty?: string })[] };
    const porKid = new Map<string, KeyObject>();
    for (const jwk of keys ?? []) {
      if (jwk.kty === 'RSA' && jwk.kid) porKid.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
    }
    this.llaves = { hasta: this.ahora().getTime() + VIGENCIA_LLAVES_MS, porKid };
    const llave = porKid.get(kid);
    if (!llave) throw new Error('La llave del ID token no está entre las del proveedor');
    return llave;
  }
}
