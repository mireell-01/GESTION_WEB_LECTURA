import { beforeEach, describe, expect, it } from 'vitest';

import { IdentidadGoogle, ProveedorGoogle } from '../../../../src/modules/iam/application/ports/proveedor-google';
import { IngresoGoogleUseCase } from '../../../../src/modules/iam/application/use-cases/ingreso-google.use-case';
import { Cuenta } from '../../../../src/modules/iam/domain/entities/cuenta';
import { EVENTOS_IAM } from '../../../../src/modules/iam/domain/events/eventos-iam';
import { Email } from '../../../../src/modules/iam/domain/value-objects/email';
import { Rol } from '../../../../src/modules/iam/domain/value-objects/rol';
import { HmacFirmador } from '../../../../src/modules/iam/infrastructure/crypto/hmac-firmador';
import { crearEntorno, cuentaActiva, Entorno } from '../dobles';

/**
 * Nivel 1 — Ingreso con Google (OpenID Connect con PKCE) para docentes y familias: ingresar, registrarse y vincular,
 * con sus límites (correo verificado por Google, cuentas suspendidas, equipo de contenidos, MFA) y un viaje que
 * solo vale con su cookie firmada, vigente y el mismo state.
 */
const WEB = 'https://lectoaventura.test';

class GoogleFalso implements ProveedorGoogle {
  readonly modo = 'SIMULADO' as const;
  identidad: IdentidadGoogle = { sub: 'google-ana', email: 'ana@gmail.com', emailVerificado: true, nombre: 'Ana Quispe' };
  falla = false;
  ultimaUrl: { state: string; nonce: string; codeVerifier: string; pista?: string } | null = null;
  canjes: { codigo: string; codeVerifier: string; nonce: string }[] = [];
  urlAutorizacion(p: { state: string; nonce: string; codeVerifier: string; pista?: string }) {
    this.ultimaUrl = p;
    return `https://google.test/auth?state=${p.state}`;
  }
  async canjearCodigo(p: { codigo: string; codeVerifier: string; nonce: string }) {
    this.canjes.push(p);
    if (this.falla) throw new Error('el proveedor rechazó el código');
    return this.identidad;
  }
}

describe('[Iam][Core][Fast] Ingreso con Google para docentes y familias', () => {
  let e: Entorno;
  let google: GoogleFalso;
  let uc: IngresoGoogleUseCase;

  const crear = (proveedor: ProveedorGoogle | null) =>
    new IngresoGoogleUseCase(e.cuentas, e.hash, e.tokens, new HmacFirmador('secreto-de-pruebas-unitarias-con-mas-de-32-caracteres', 'ingreso-google'), e.emisor, e.bus, proveedor, WEB, e.generarId, e.reloj.ahora);

  /** Un viaje completo: sale a Google y vuelve con su cookie, su state y un código. */
  async function viaje(p: { intencion: 'INGRESAR' | 'REGISTRAR' | 'VINCULAR'; rol?: string; cuentaId?: string }, vuelta: { state?: string; errorProveedor?: string } = {}) {
    const salida = uc.iniciar(p);
    if (!('cookie' in salida)) return salida;
    return uc.completar({ cookie: salida.cookie, state: vuelta.state ?? google.ultimaUrl?.state, codigo: 'codigo-de-google', errorProveedor: vuelta.errorProveedor });
  }

  beforeEach(() => {
    e = crearEntorno();
    google = new GoogleFalso();
    uc = crear(google);
  });

  it('sin credenciales de Google no está disponible: la web no muestra el botón y el viaje vuelve al ingreso', async () => {
    uc = crear(null);
    expect(uc.disponible()).toEqual({ disponible: false, simulado: false });
    expect(uc.iniciar({ intencion: 'INGRESAR' })).toEqual({ destino: `${WEB}/ingresar?google=no-disponible` });
    expect(crear(google).disponible()).toEqual({ disponible: true, simulado: true });
  });

  it('el viaje sale con state, nonce y verificador PKCE distintos, y el canje recibe ese mismo verificador y ese nonce', async () => {
    await cuentaActiva(e, { email: 'ana@gmail.com' });
    const salida = uc.iniciar({ intencion: 'INGRESAR', pista: 'ana@gmail.com' });
    expect(salida).toMatchObject({ url: expect.stringContaining('https://google.test/auth') });
    const { state, nonce, codeVerifier, pista } = google.ultimaUrl!;
    expect(new Set([state, nonce, codeVerifier]).size).toBe(3);
    expect(pista).toBe('ana@gmail.com');
    await uc.completar({ cookie: (salida as { cookie: string }).cookie, state, codigo: 'codigo-de-google' });
    expect(google.canjes).toEqual([{ codigo: 'codigo-de-google', codeVerifier, nonce }]);
  });

  it('registrarse: crea la cuenta ACTIVA con el rol elegido, vinculada a Google, y abre su sesión en su panel', async () => {
    const r = await viaje({ intencion: 'REGISTRAR', rol: 'DOCENTE' });
    expect(r).toMatchObject({ destino: `${WEB}/docente`, sesion: { rol: 'DOCENTE', rutaInicial: '/docente' } });
    const cuenta = (await e.cuentas.buscarPorEmail('ana@gmail.com')) as Cuenta;
    expect(cuenta).toMatchObject({ nombre: 'Ana Quispe', googleSub: 'google-ana' });
    expect(cuenta.estaActiva()).toBe(true);
    expect(cuenta.rol.value).toBe('DOCENTE');
    expect(e.bus.publicados.find((x) => x.nombreEvento === EVENTOS_IAM.CUENTA_CREADA)?.datos).toEqual({ actorId: cuenta.id, rol: 'DOCENTE', via: 'GOOGLE' });
    expect(e.sesiones.filas.size).toBe(1);
  });

  it('registrarse solo como docente o familiar: otro rol ni siquiera sale a Google', () => {
    for (const rol of ['EDITOR', 'ADMIN_PLATAFORMA', 'ESTUDIANTE', undefined]) {
      expect(uc.iniciar({ intencion: 'REGISTRAR', rol })).toEqual({ destino: `${WEB}/registro?google=no-permitido` });
    }
  });

  it('ingresar: con la cuenta ya vinculada entra directo; con la de ese correo, la vincula (y la verifica si faltaba)', async () => {
    const pendiente = await cuentaActiva(e, { email: 'ana@gmail.com', verificada: false });
    const primera = await viaje({ intencion: 'INGRESAR' });
    expect(primera).toMatchObject({ destino: `${WEB}/familia`, sesion: { rol: 'FAMILIAR' } });
    const vinculada = (await e.cuentas.buscarPorId(pendiente.id)) as Cuenta;
    expect(vinculada.googleSub).toBe('google-ana');
    expect(vinculada.estaActiva()).toBe(true);
    expect(e.bus.nombres()).toContain(EVENTOS_IAM.GOOGLE_VINCULADA);

    // Aunque cambie el correo de su cuenta de Google, la reconoce por su identificador estable.
    google.identidad = { ...google.identidad, email: 'ana.nueva@gmail.com' };
    expect(await viaje({ intencion: 'INGRESAR' })).toMatchObject({ sesion: { rol: 'FAMILIAR' } });
    expect(e.cuentas.filas.size).toBe(1);
  });

  it('ingresar sin cuenta invita a registrarse; registrarse con un correo que ya tiene cuenta, entra en esa cuenta', async () => {
    expect(await viaje({ intencion: 'INGRESAR' })).toEqual({ destino: `${WEB}/ingresar?google=sin-cuenta` });
    expect(e.cuentas.filas.size).toBe(0);
    const ya = await cuentaActiva(e, { email: 'ana@gmail.com', rol: 'DOCENTE' });
    expect(await viaje({ intencion: 'REGISTRAR', rol: 'FAMILIAR' })).toMatchObject({ sesion: { rol: 'DOCENTE' } });
    expect(e.cuentas.filas.size).toBe(1);
    expect(((await e.cuentas.buscarPorId(ya.id)) as Cuenta).googleSub).toBe('google-ana');
  });

  it('no pasan: un correo que Google no verificó, una cuenta suspendida, el equipo de contenidos ni quien usa MFA', async () => {
    google.identidad = { ...google.identidad, emailVerificado: false };
    expect(await viaje({ intencion: 'REGISTRAR', rol: 'FAMILIAR' })).toEqual({ destino: `${WEB}/registro?google=correo-no-verificado` });
    expect(e.cuentas.filas.size).toBe(0);
    google.identidad = { ...google.identidad, emailVerificado: true };

    const suspendida = await cuentaActiva(e, { email: 'ana@gmail.com', rol: 'DOCENTE' });
    suspendida.suspender();
    await e.cuentas.guardar(suspendida);
    expect(await viaje({ intencion: 'INGRESAR' })).toEqual({ destino: `${WEB}/ingresar?google=suspendida` });

    await cuentaActiva(e, { email: 'editora@gmail.com', rol: 'EDITOR' });
    google.identidad = { ...google.identidad, sub: 'google-editora', email: 'editora@gmail.com' };
    expect(await viaje({ intencion: 'INGRESAR' })).toEqual({ destino: `${WEB}/ingresar?google=no-permitido` });

    const conMfa = await cuentaActiva(e, { email: 'mfa@gmail.com', rol: 'DOCENTE' });
    conMfa.iniciarMfa('SECRETO');
    conMfa.confirmarMfa();
    await e.cuentas.guardar(conMfa);
    google.identidad = { ...google.identidad, sub: 'google-mfa', email: 'mfa@gmail.com' };
    expect(await viaje({ intencion: 'INGRESAR' })).toEqual({ destino: `${WEB}/ingresar?google=no-permitido` });
    expect(e.sesiones.filas.size).toBe(0);
  });

  it('el viaje solo vale con su cookie: otra firma, vencida, otro state, cancelado en Google o un canje fallido no abren sesión', async () => {
    await cuentaActiva(e, { email: 'ana@gmail.com' });
    const salida = uc.iniciar({ intencion: 'INGRESAR' }) as { cookie: string };
    const state = google.ultimaUrl!.state;
    const [datos] = salida.cookie.split('.');
    expect(await uc.completar({ cookie: `${datos}.firma-falsa`, state, codigo: 'c' })).toEqual({ destino: `${WEB}/ingresar?google=vencido` });
    expect(await uc.completar({ cookie: undefined, state, codigo: 'c' })).toEqual({ destino: `${WEB}/ingresar?google=vencido` });
    expect(await uc.completar({ cookie: salida.cookie, state: 'otro-state', codigo: 'c' })).toEqual({ destino: `${WEB}/ingresar?google=vencido` });
    expect(await uc.completar({ cookie: salida.cookie, state, errorProveedor: 'access_denied' })).toEqual({ destino: `${WEB}/ingresar?google=cancelado` });
    google.falla = true;
    expect(await uc.completar({ cookie: salida.cookie, state, codigo: 'c' })).toEqual({ destino: `${WEB}/ingresar?google=error` });
    google.falla = false;
    e.reloj.avanzarMin(11);
    expect(await uc.completar({ cookie: salida.cookie, state, codigo: 'c' })).toEqual({ destino: `${WEB}/ingresar?google=vencido` });
    expect(e.sesiones.filas.size).toBe(0);
  });

  it('vincular desde su panel: queda vinculada; si esa cuenta de Google ya es de otra persona, no se roba', async () => {
    const docente = await cuentaActiva(e, { email: 'profe@colegio.edu.pe', rol: 'DOCENTE' });
    expect(await viaje({ intencion: 'VINCULAR', cuentaId: docente.id })).toEqual({ destino: `${WEB}/docente?google=vinculada` });
    expect(await uc.estado(docente.id)).toEqual({ disponible: true, simulado: true, vinculada: true, puedeUsar: true });
    // Ya puede ingresar con Google aunque su cuenta de Google tenga otro correo.
    expect(await viaje({ intencion: 'INGRESAR' })).toMatchObject({ sesion: { rol: 'DOCENTE' } });

    const familiar = await cuentaActiva(e, { email: 'mama@correo.pe' });
    expect(await viaje({ intencion: 'VINCULAR', cuentaId: familiar.id })).toEqual({ destino: `${WEB}/familia?google=ya-vinculada` });
    expect(((await e.cuentas.buscarPorId(familiar.id)) as Cuenta).googleSub).toBeNull();
  });

  it('desvincular deja de ingresar con Google (queda auditado) y la persona sigue con su contraseña', async () => {
    const docente = await cuentaActiva(e, { email: 'ana@gmail.com', rol: 'DOCENTE' });
    await viaje({ intencion: 'INGRESAR' });
    expect(await uc.desvincular(docente.id)).toEqual({ vinculada: false });
    expect(e.bus.nombres()).toContain(EVENTOS_IAM.GOOGLE_DESVINCULADA);
    expect(((await e.cuentas.buscarPorId(docente.id)) as Cuenta).googleSub).toBeNull();
    expect(await uc.estado(docente.id)).toMatchObject({ vinculada: false });
  });
});

describe('[Iam][Core][Fast] La cuenta adulta y Google', () => {
  const ahora = new Date('2026-11-13T15:00:00Z');
  const registrar = (rol: string) =>
    Cuenta.registrarConGoogle({ id: 'c-1', nombre: 'Ana', email: Email.de('ana@gmail.com'), rol: Rol.de(rol as never), hashContrasena: 'h', googleSub: 'g-1', ahora });

  it('con Google se registran docentes y familias, y la cuenta nace activa y vinculada', () => {
    const c = registrar('FAMILIAR');
    expect(c.estaActiva()).toBe(true);
    expect(c.googleSub).toBe('g-1');
    expect(registrar('DOCENTE').puedeUsarGoogle()).toBe(true);
    for (const rol of ['EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA']) expect(() => registrar(rol)).toThrow(/docentes y familias/);
  });

  it('quien activó la verificación en dos pasos no usa Google (no se salta ese segundo factor)', () => {
    const c = registrar('DOCENTE');
    c.iniciarMfa('SECRETO');
    c.confirmarMfa();
    expect(c.puedeUsarGoogle()).toBe(false);
    expect(() => c.vincularGoogle('g-2')).toThrow(/contraseña y código/);
    c.desvincularGoogle();
    expect(c.googleSub).toBeNull();
  });
});
