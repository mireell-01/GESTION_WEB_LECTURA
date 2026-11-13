import { createHash, generateKeyPairSync, KeyObject, randomBytes, sign } from 'node:crypto';

import { retoPkce } from './oidc-google';

/** El emisor del "Google de prueba": no es un dominio real ni lo será (.test, RFC 2606). */
export const EMISOR_SIMULADO = 'https://google-de-prueba.lectoaventura.test';

interface CodigoPendiente {
  email: string;
  nombre: string;
  nonce: string;
  reto: string;
  redirectUri: string;
  expira: number;
}

/**
 * "Google de prueba" — SOLO fuera de producción y sin credenciales de Google configuradas. Imita lo justo de un
 * proveedor OpenID Connect (autorización con PKCE, canje del código y llaves públicas) para probar el ingreso con
 * Google en la computadora del equipo y en las pruebas automáticas, con el mismo adaptador que habla con Google.
 * Firma sus ID tokens con una llave RSA que nace y muere con el proceso.
 */
export class GoogleSimulado {
  readonly clientId = 'lectoaventura-desarrollo';
  readonly clientSecret = randomBytes(24).toString('base64url');
  private readonly kid = `simulado-${randomBytes(4).toString('hex')}`;
  private readonly llaves: { publicKey: KeyObject; privateKey: KeyObject } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  private readonly codigos = new Map<string, CodigoPendiente>();

  constructor(
    private readonly redirectUri: string,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  /** La persona "eligió su cuenta": devuelve a dónde volver con el código (solo a nuestra propia vuelta). */
  autorizar(p: { clientId?: string; redirectUri?: string; state?: string; nonce?: string; codeChallenge?: string; email?: string; nombre?: string }): string {
    if (p.clientId !== this.clientId || p.redirectUri !== this.redirectUri) throw new Error('Cliente o vuelta desconocidos');
    if (!p.state || !p.nonce || !p.codeChallenge) throw new Error('Faltan state, nonce o el reto PKCE');
    const email = (p.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un correo válido');
    const codigo = randomBytes(24).toString('base64url');
    this.codigos.set(codigo, {
      email,
      nombre: (p.nombre ?? '').trim() || email.split('@')[0] || 'Persona de prueba',
      nonce: p.nonce,
      reto: p.codeChallenge,
      redirectUri: p.redirectUri,
      expira: this.ahora().getTime() + 5 * 60_000,
    });
    const vuelta = new URL(this.redirectUri);
    vuelta.searchParams.set('code', codigo);
    vuelta.searchParams.set('state', p.state);
    return vuelta.toString();
  }

  /** Canje del código (una sola vez, con el verificador PKCE correcto): devuelve el ID token firmado. */
  canjear(p: { code?: string; clientId?: string; clientSecret?: string; redirectUri?: string; codeVerifier?: string }): { id_token: string } {
    const pendiente = p.code ? this.codigos.get(p.code) : undefined;
    if (p.code) this.codigos.delete(p.code);
    if (!pendiente || pendiente.expira < this.ahora().getTime()) throw new Error('Código inválido o vencido');
    if (p.clientId !== this.clientId || p.clientSecret !== this.clientSecret || p.redirectUri !== pendiente.redirectUri) {
      throw new Error('Credenciales del cliente inválidas');
    }
    if (!p.codeVerifier || retoPkce(p.codeVerifier) !== pendiente.reto) throw new Error('El verificador PKCE no corresponde');
    const ahoraS = Math.floor(this.ahora().getTime() / 1000);
    return {
      id_token: this.firmar({
        iss: EMISOR_SIMULADO,
        aud: this.clientId,
        sub: `simulado-${createHash('sha256').update(pendiente.email).digest('hex').slice(0, 20)}`,
        email: pendiente.email,
        email_verified: true,
        name: pendiente.nombre,
        nonce: pendiente.nonce,
        iat: ahoraS,
        exp: ahoraS + 3600,
      }),
    };
  }

  jwks(): { keys: Record<string, unknown>[] } {
    return { keys: [{ ...this.llaves.publicKey.export({ format: 'jwk' }), kid: this.kid, alg: 'RS256', use: 'sig' }] };
  }

  /** Para el adaptador OIDC: responde al canje y a las llaves sin salir del proceso (también en las pruebas). */
  readonly pedir: typeof fetch = async (entrada, init) => {
    const url = String(entrada);
    try {
      if (url.endsWith('/jwks')) return Response.json(this.jwks());
      if (url.endsWith('/token')) {
        const f = new URLSearchParams(String(init?.body ?? ''));
        return Response.json(
          this.canjear({
            code: f.get('code') ?? undefined,
            clientId: f.get('client_id') ?? undefined,
            clientSecret: f.get('client_secret') ?? undefined,
            redirectUri: f.get('redirect_uri') ?? undefined,
            codeVerifier: f.get('code_verifier') ?? undefined,
          }),
        );
      }
      return new Response(null, { status: 404 });
    } catch {
      return Response.json({ error: 'invalid_grant' }, { status: 400 });
    }
  };

  private firmar(reclamos: Record<string, unknown>): string {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const datos = `${b64({ alg: 'RS256', typ: 'JWT', kid: this.kid })}.${b64(reclamos)}`;
    return `${datos}.${sign('RSA-SHA256', Buffer.from(datos), this.llaves.privateKey).toString('base64url')}`;
  }
}
