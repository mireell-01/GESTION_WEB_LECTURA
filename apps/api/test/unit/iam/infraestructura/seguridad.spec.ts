import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Argon2HashService } from '../../../../src/modules/iam/infrastructure/crypto/argon2-hash.service';
import { JwtTokenService } from '../../../../src/modules/iam/infrastructure/crypto/jwt-token.service';
import { OtplibTotpService } from '../../../../src/modules/iam/infrastructure/crypto/otplib-totp.service';
import { ListaContrasenasFiltradas } from '../../../../src/modules/iam/infrastructure/passwords/lista-contrasenas-filtradas';

const SECRETO = 'secreto-de-pruebas-de-al-menos-32-caracteres!!';
const DATOS = { sub: 'cuenta-1', rol: 'DOCENTE', mfa: false, sid: 'sesion-1' };

describe('JwtTokenService (RF-003)', () => {
  const tokens = new JwtTokenService(SECRETO);

  afterEach(() => vi.useRealTimers());

  it('rechaza secretos cortos al construirse', () => {
    expect(() => new JwtTokenService('corto')).toThrow(/32 caracteres/);
  });

  it('firma y verifica el access token con sub, rol, mfa y sid', () => {
    const token = tokens.emitirAccessToken(DATOS);
    expect(tokens.verificarAccessToken(token)).toEqual(DATOS);
    const decodificado = jwt.decode(token) as jwt.JwtPayload;
    expect(decodificado.iss).toBe('lectoaventura');
    expect((decodificado.exp as number) - (decodificado.iat as number)).toBe(15 * 60);
  });

  it('rechaza tokens firmados con otro secreto, alterados o con alg "none"', () => {
    const ajeno = new JwtTokenService('otro-secreto-de-pruebas-de-32-caracteres-xx').emitirAccessToken(DATOS);
    expect(tokens.verificarAccessToken(ajeno)).toBeNull();

    const [cabecera, , firma] = tokens.emitirAccessToken(DATOS).split('.');
    const cuerpoAdmin = Buffer.from(JSON.stringify({ ...DATOS, rol: 'ADMIN_PLATAFORMA', iss: 'lectoaventura' })).toString('base64url');
    expect(tokens.verificarAccessToken(`${cabecera}.${cuerpoAdmin}.${firma}`)).toBeNull();

    const sinFirma = jwt.sign({ rol: 'ADMIN_PLATAFORMA', sid: 's', mfa: true }, '', { algorithm: 'none', subject: 'x', issuer: 'lectoaventura' });
    expect(tokens.verificarAccessToken(sinFirma)).toBeNull();
    expect(tokens.verificarAccessToken('no-es-un-jwt')).toBeNull();
  });

  it('el access token vence a los 15 minutos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T15:00:00Z'));
    const token = tokens.emitirAccessToken(DATOS);
    vi.setSystemTime(new Date('2026-10-15T15:14:59Z'));
    expect(tokens.verificarAccessToken(token)).not.toBeNull();
    vi.setSystemTime(new Date('2026-10-15T15:15:01Z'));
    expect(tokens.verificarAccessToken(token)).toBeNull();
  });

  it('los tokens opacos son únicos y su huella es SHA-256 determinista', () => {
    const a = tokens.generarTokenOpaco();
    const b = tokens.generarTokenOpaco();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokens.huella(a)).toBe(tokens.huella(a));
    expect(tokens.huella(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Argon2HashService', () => {
  const hash = new Argon2HashService();

  it('usa argon2id con sal: dos hashes del mismo PIN son distintos y ambos verifican', async () => {
    const a = await hash.hash('2580');
    const b = await hash.hash('2580');
    // RNF-017: m = 19 MiB (19456 KiB), t = 2, p = 1 (el orden en el hash lo decide la librería).
    expect(a).toMatch(/^\$argon2id\$v=19\$/);
    const parametros = Object.fromEntries((a.split('$')[3] ?? '').split(',').map((p) => p.split('=')));
    expect(parametros).toEqual({ m: '19456', t: '2', p: '1' });
    expect(a).not.toBe(b);
    expect(await hash.verificar('2580', a)).toBe(true);
    expect(await hash.verificar('2581', a)).toBe(false);
  });

  it('verificar contra un hash vacío o corrupto devuelve false sin lanzar', async () => {
    expect(await hash.verificar('2580', '')).toBe(false);
    expect(await hash.verificar('2580', 'no-es-argon2')).toBe(false);
  });
});

describe('OtplibTotpService (RF-011)', () => {
  const totp = new OtplibTotpService();

  it('acepta el código actual de la app autenticadora y rechaza otros', () => {
    const secreto = totp.generarSecreto();
    expect(totp.verificar(secreto, authenticator.generate(secreto))).toBe(true);
    expect(totp.verificar(secreto, '000000')).toBe(false);
    expect(totp.verificar(secreto, '12345')).toBe(false);
    expect(totp.verificar(secreto, 'abcdef')).toBe(false);
  });

  it('genera la URL otpauth con el emisor LectoAventura', () => {
    expect(totp.urlConfiguracion('ana@lectoaventura.test', 'JBSWY3DPEHPK3PXP')).toMatch(
      /^otpauth:\/\/totp\/LectoAventura:ana%40lectoaventura\.test\?secret=JBSWY3DPEHPK3PXP/,
    );
  });
});

describe('ListaContrasenasFiltradas (RF-001)', () => {
  const lista = new ListaContrasenasFiltradas();

  it.each(['1234567890', 'Contrasena123', 'aaaaaaaaaa', '0123456789012', 'LectoAventura123'])('rechaza "%s"', async (c) => {
    expect(await lista.estaFiltrada(c)).toBe(true);
  });

  it('rechaza contraseñas basadas en el correo o el nombre de la persona', async () => {
    expect(await lista.estaFiltrada('rosamaria2026', { email: 'rosamaria@colegio.pe' })).toBe(true);
    expect(await lista.estaFiltrada('Rosa123456', { nombre: 'Rosa Demo' })).toBe(true);
  });

  it('acepta una contraseña robusta', async () => {
    expect(await lista.estaFiltrada('Lectura-Segura-2026', { email: 'ana@colegio.pe', nombre: 'Ana Ríos' })).toBe(false);
  });
});
