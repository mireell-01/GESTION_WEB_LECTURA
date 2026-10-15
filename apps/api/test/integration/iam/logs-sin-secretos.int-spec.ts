import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppDePrueba, cookieRefresh, crearApp, vaciarBase } from '../setup/app';

/**
 * Nivel 2 — RNF-031: "0 ocurrencias de PIN, contraseña, token o texto libre de estudiantes en logs,
 * verificado por prueba automatizada". Se captura TODO lo que la API escribe en stdout/stderr
 * durante un recorrido completo de IAM y se buscan los secretos usados.
 */
const API = '/api/v1';
const CONTRASENA = 'Clave-Secreta-Unica-7319';
const PIN = '4826';

let t: AppDePrueba;
let salida = '';
const originales = { out: process.stdout.write.bind(process.stdout), err: process.stderr.write.bind(process.stderr) };

beforeAll(async () => {
  t = await crearApp({ conLogs: true });
  await vaciarBase(t.prisma);
  const capturar = (original: typeof process.stdout.write) =>
    ((fragmento: string | Uint8Array, ...resto: unknown[]) => {
      salida += typeof fragmento === 'string' ? fragmento : Buffer.from(fragmento).toString('utf8');
      return (original as (...a: unknown[]) => boolean)(fragmento, ...resto);
    }) as typeof process.stdout.write;
  process.stdout.write = capturar(originales.out);
  process.stderr.write = capturar(originales.err);
});

afterAll(async () => {
  process.stdout.write = originales.out;
  process.stderr.write = originales.err;
  await t?.cerrar();
});

describe('Logs sin secretos (RNF-031)', () => {
  it('un recorrido completo de IAM no deja contraseñas, PIN, tokens ni códigos en los logs', async () => {
    const secretos: string[] = [CONTRASENA, PIN];
    const email = 'secretos@lectoaventura.test';

    await t.http().post(`${API}/auth/registro`).send({ nombre: 'Rosa Prueba', email, contrasena: CONTRASENA, rol: 'FAMILIAR' }).expect(201);
    const [correo] = (await t.http().get(`${API}/dev/correos`)).body as { enlace: string }[];
    const codigo = new URL(correo?.enlace as string).searchParams.get('codigo') as string;
    secretos.push(codigo);
    await t.http().post(`${API}/auth/verificar-correo`).send({ codigo }).expect(200);

    // Errores a propósito: contraseña equivocada y JSON inválido.
    await t.http().post(`${API}/auth/login`).send({ email, contrasena: `${CONTRASENA}-mal` }).expect(401);
    await t.http().post(`${API}/auth/login`).set('Content-Type', 'application/json').send('{"email": roto').expect(400);

    const login = await t.http().post(`${API}/auth/login`).send({ email, contrasena: CONTRASENA }).expect(200);
    const token = login.body.accessToken as string;
    const refresh = (cookieRefresh(login) as string).split(';')[0]?.split('=')[1] as string;
    secretos.push(token, refresh);
    const auth = { Authorization: `Bearer ${token}` };

    await t.http().post(`${API}/consentimientos`).set(auth).send({ otorganteNombre: 'Rosa Prueba', aceptaPolitica: true }).expect(201);
    const perfil = await t.http().post(`${API}/estudiantes`).set(auth).send({ alias: 'Mia', anioNacimiento: 2018, mesNacimiento: 2, avatar: 'abeja', pin: PIN }).expect(201);
    const { tokenDispositivo } = (await t.http().post(`${API}/familia/dispositivos`).set(auth).send({ nombre: 'Tablet' }).expect(201)).body;
    secretos.push(tokenDispositivo);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo, perfilId: perfil.body.id, pin: '1357' }).expect(401);
    await t.http().post(`${API}/acceso-estudiante/login`).send({ tokenDispositivo, perfilId: perfil.body.id, pin: PIN }).expect(200);

    const exportacion = (await t.http().post(`${API}/estudiantes/${perfil.body.id}/exportaciones`).set(auth).expect(201)).body;
    secretos.push(new URL(exportacion.enlaces.pdf, 'http://x').searchParams.get('firma') as string);
    await t.http().get(exportacion.enlaces.json).expect(200);
    await t.http().post(`${API}/auth/recuperar`).send({ email }).expect(202);

    const cuenta = await t.prisma.cuenta.findUniqueOrThrow({ where: { email } });
    const fila = await t.prisma.perfilEstudiante.findUniqueOrThrow({ where: { id: perfil.body.id } });
    secretos.push(cuenta.hashContrasena, fila.hashPin);

    expect(salida.length).toBeGreaterThan(0);
    for (const secreto of secretos) {
      expect(salida.includes(secreto), `Un secreto apareció en los logs: ${secreto.slice(0, 6)}…`).toBe(false);
    }
  });
});
