import { generateKeyPairSync, sign } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { EMISOR_SIMULADO, GoogleSimulado } from '../../../../src/modules/iam/infrastructure/google/google-simulado';
import { ConfigOidc, EXTREMOS_GOOGLE, OidcGoogle, retoPkce } from '../../../../src/modules/iam/infrastructure/google/oidc-google';
import { esOrigenLocal, proveedorGoogle } from '../../../../src/modules/iam/infrastructure/iam.providers';

/**
 * Nivel 1 — El adaptador OpenID Connect del ingreso con Google: arma la autorización con PKCE y valida el ID token
 * como pide la especificación (firma RS256 con las llaves del proveedor, emisor, audiencia, vigencia y nonce). Se
 * prueba contra el "Google de prueba" y contra tokens armados a mano para cada forma de engaño.
 */
const VUELTA = 'https://lectoaventura.test/api/v1/auth/google/callback';
const VERIFICADOR = 'verificador-pkce-de-43-caracteres-o-mas-aaaaaa';

function conSimulado(ahora = () => new Date('2026-11-13T15:00:00Z')) {
  const simulado = new GoogleSimulado(VUELTA, ahora);
  const config: ConfigOidc = {
    modo: 'SIMULADO',
    clientId: simulado.clientId,
    clientSecret: simulado.clientSecret,
    redirectUri: VUELTA,
    urlAutorizacion: 'https://lectoaventura.test/api/v1/dev/google/autorizar',
    urlToken: `${EMISOR_SIMULADO}/token`,
    urlJwks: `${EMISOR_SIMULADO}/jwks`,
    emisores: [EMISOR_SIMULADO],
  };
  return { simulado, oidc: new OidcGoogle(config, simulado.pedir, ahora) };
}

/** Elige la cuenta en el "Google de prueba" y devuelve el código de la vuelta. */
function codigoDe(simulado: GoogleSimulado, url: string, email = 'ana@gmail.com'): string {
  const q = new URL(url).searchParams;
  const vuelta = simulado.autorizar({
    clientId: q.get('client_id') ?? undefined,
    redirectUri: q.get('redirect_uri') ?? undefined,
    state: q.get('state') ?? undefined,
    nonce: q.get('nonce') ?? undefined,
    codeChallenge: q.get('code_challenge') ?? undefined,
    email,
  });
  return new URL(vuelta).searchParams.get('code') as string;
}

/** Un proveedor que devuelve el ID token que uno quiera, firmado con la llave que uno quiera. */
function conToken(reclamos: Record<string, unknown>, opciones: { alg?: string; kid?: string; firmarCon?: 'otra' | 'nada' } = {}) {
  const llaves = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const otra = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const datos = `${b64({ alg: opciones.alg ?? 'RS256', typ: 'JWT', kid: opciones.kid ?? 'llave-1' })}.${b64(reclamos)}`;
  const firma = opciones.firmarCon === 'nada' ? '' : sign('RSA-SHA256', Buffer.from(datos), (opciones.firmarCon === 'otra' ? otra : llaves).privateKey).toString('base64url');
  const pedir: typeof fetch = async (url) =>
    String(url).endsWith('certs')
      ? Response.json({ keys: [{ ...llaves.publicKey.export({ format: 'jwk' }), kid: 'llave-1', alg: 'RS256', use: 'sig' }] })
      : Response.json({ id_token: `${datos}.${firma}` });
  const config: ConfigOidc = { modo: 'GOOGLE', clientId: 'mi-cliente.apps.googleusercontent.com', clientSecret: 'secreto', redirectUri: VUELTA, ...EXTREMOS_GOOGLE };
  return new OidcGoogle(config, pedir, () => new Date('2026-11-13T15:00:00Z'));
}

const AHORA_S = Math.floor(new Date('2026-11-13T15:00:00Z').getTime() / 1000);
const validos = {
  iss: 'https://accounts.google.com',
  aud: 'mi-cliente.apps.googleusercontent.com',
  sub: '1098765',
  email: 'Ana@Gmail.com',
  email_verified: true,
  name: 'Ana Quispe',
  nonce: 'nonce-1',
  iat: AHORA_S,
  exp: AHORA_S + 3600,
};

describe('[Iam][Core][Fast] Adaptador OpenID Connect del ingreso con Google', () => {
  it('la autorización va con el reto PKCE S256 (nunca el verificador), los permisos mínimos y la vuelta a la web', () => {
    const { oidc } = conSimulado();
    const q = new URL(oidc.urlAutorizacion({ state: 's-1', nonce: 'n-1', codeVerifier: VERIFICADOR, pista: 'ana@gmail.com' })).searchParams;
    expect(Object.fromEntries(q)).toMatchObject({
      response_type: 'code',
      scope: 'openid email profile',
      redirect_uri: VUELTA,
      state: 's-1',
      nonce: 'n-1',
      code_challenge: retoPkce(VERIFICADOR),
      code_challenge_method: 'S256',
      login_hint: 'ana@gmail.com',
    });
    expect(q.toString()).not.toContain(VERIFICADOR);
  });

  it('con el "Google de prueba": el código, canjeado con su verificador, da la identidad verificada', async () => {
    const { simulado, oidc } = conSimulado();
    const codigo = codigoDe(simulado, oidc.urlAutorizacion({ state: 's', nonce: 'n', codeVerifier: VERIFICADOR }), 'Ana@Gmail.com');
    const identidad = await oidc.canjearCodigo({ codigo, codeVerifier: VERIFICADOR, nonce: 'n' });
    expect(identidad).toMatchObject({ email: 'ana@gmail.com', emailVerificado: true, nombre: 'ana' });
    expect(identidad.sub).toMatch(/^simulado-/);
  });

  it('el código sirve una sola vez y solo con su verificador PKCE y su nonce', async () => {
    const { simulado, oidc } = conSimulado();
    const url = () => oidc.urlAutorizacion({ state: 's', nonce: 'n', codeVerifier: VERIFICADOR });
    const robado = codigoDe(simulado, url());
    await expect(oidc.canjearCodigo({ codigo: robado, codeVerifier: 'otro-verificador-que-no-es-el-del-viaje-aaaa', nonce: 'n' })).rejects.toThrow(/rechazó/);
    const bueno = codigoDe(simulado, url());
    await oidc.canjearCodigo({ codigo: bueno, codeVerifier: VERIFICADOR, nonce: 'n' });
    await expect(oidc.canjearCodigo({ codigo: bueno, codeVerifier: VERIFICADOR, nonce: 'n' })).rejects.toThrow(/rechazó/);
    const otroNonce = codigoDe(simulado, url());
    await expect(oidc.canjearCodigo({ codigo: otroNonce, codeVerifier: VERIFICADOR, nonce: 'nonce-de-otro-viaje' })).rejects.toThrow(/nonce/);
  });

  it('el "Google de prueba" solo devuelve a nuestra propia vuelta y con un correo válido', () => {
    const { simulado } = conSimulado();
    const base = { clientId: simulado.clientId, state: 's', nonce: 'n', codeChallenge: 'r', email: 'ana@gmail.com' };
    expect(() => simulado.autorizar({ ...base, redirectUri: 'https://sitio-malo.test/robar' })).toThrow(/vuelta/);
    expect(() => simulado.autorizar({ ...base, redirectUri: VUELTA, email: 'no-es-correo' })).toThrow(/correo/);
    expect(simulado.autorizar({ ...base, redirectUri: VUELTA })).toMatch(/^https:\/\/lectoaventura\.test\/api\/v1\/auth\/google\/callback\?code=.+&state=s$/);
  });

  it('acepta un ID token de Google bien firmado y para esta aplicación', async () => {
    await expect(conToken(validos).canjearCodigo({ codigo: 'c', codeVerifier: VERIFICADOR, nonce: 'nonce-1' })).resolves.toEqual({
      sub: '1098765',
      email: 'ana@gmail.com',
      emailVerificado: true,
      nombre: 'Ana Quispe',
    });
  });

  it.each([
    ['firmado con otra llave', validos, { firmarCon: 'otra' as const }, /Firma/],
    ['sin firma', validos, { firmarCon: 'nada' as const }, /Firma/],
    ['con el algoritmo "none"', validos, { alg: 'none' }, /Algoritmo/],
    ['con una llave que el proveedor no publica', validos, { kid: 'llave-desconocida' }, /llave/],
    ['de otro emisor', { ...validos, iss: 'https://google-falso.test' }, {}, /Emisor/],
    ['para otra aplicación', { ...validos, aud: 'otra-app.apps.googleusercontent.com' }, {}, /esta aplicación/],
    ['vencido', { ...validos, exp: AHORA_S - 3600 }, {}, /venció/],
    ['emitido en el futuro', { ...validos, iat: AHORA_S + 3600 }, {}, /futuro/],
    ['de otro ingreso (otro nonce)', { ...validos, nonce: 'nonce-robado' }, {}, /nonce/],
  ])('rechaza un ID token %s', async (_caso, reclamos, opciones, error) => {
    await expect(conToken(reclamos, opciones).canjearCodigo({ codigo: 'c', codeVerifier: VERIFICADOR, nonce: 'nonce-1' })).rejects.toThrow(error);
  });

  it('un correo que Google no verificó llega marcado así (el caso de uso no lo deja pasar)', async () => {
    const identidad = await conToken({ ...validos, email_verified: false }).canjearCodigo({ codigo: 'c', codeVerifier: VERIFICADOR, nonce: 'nonce-1' });
    expect(identidad.emailVerificado).toBe(false);
  });
});

describe('[Iam][Core][Fast] Cuándo hay ingreso con Google y cuándo el "Google de prueba"', () => {
  it('con credenciales, Google de verdad; sin ellas, el de prueba solo con la web en esta computadora y fuera de producción', () => {
    const real = proveedorGoogle({ urlWeb: 'https://lectoaventura.pe', googleClientId: 'id.apps.googleusercontent.com', googleClientSecret: 'secreto' }, 'production');
    expect(real.proveedor?.modo).toBe('GOOGLE');
    expect(real.simulado).toBeNull();
    const local = proveedorGoogle({ urlWeb: 'http://localhost:3002' }, undefined);
    expect(local.proveedor?.modo).toBe('SIMULADO');
    expect(local.simulado).not.toBeNull();
    expect(proveedorGoogle({ urlWeb: 'http://localhost:3002' }, 'production')).toEqual({ proveedor: null, simulado: null });
    // Un dominio real sin credenciales: nunca el de prueba (deja entrar con cualquier correo), aunque falte NODE_ENV.
    expect(proveedorGoogle({ urlWeb: 'https://lectoaventura.pe' }, undefined)).toEqual({ proveedor: null, simulado: null });
    // Credenciales a medias: ninguno, para no mezclar el de prueba con un Google mal configurado.
    expect(proveedorGoogle({ urlWeb: 'http://localhost:3002', googleClientId: 'id' }, undefined)).toEqual({ proveedor: null, simulado: null });
  });

  it('una web local es localhost, 127.0.0.1, ::1, *.localhost o *.test; nada más', () => {
    for (const url of ['http://localhost:3002', 'http://127.0.0.1:3002', 'http://[::1]:3002', 'http://app.localhost', 'https://staging.lectoaventura.test']) expect(esOrigenLocal(url), url).toBe(true);
    for (const url of ['https://lectoaventura.pe', 'https://localhost.lectoaventura.pe', 'https://lectoaventura.test.pe', 'no-es-una-url']) expect(esOrigenLocal(url), url).toBe(false);
  });
});
