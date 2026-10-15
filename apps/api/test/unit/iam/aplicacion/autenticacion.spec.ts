import { beforeEach, describe, expect, it } from 'vitest';

import { AutenticarAdultoUseCase } from '../../../../src/modules/iam/application/use-cases/autenticar-adulto.use-case';
import { AutenticarEstudianteUseCase } from '../../../../src/modules/iam/application/use-cases/autenticar-estudiante.use-case';
import { CerrarSesionUseCase } from '../../../../src/modules/iam/application/use-cases/cerrar-sesion.use-case';
import { ConfigurarMfaUseCase } from '../../../../src/modules/iam/application/use-cases/configurar-mfa.use-case';
import { IniciarMfaUseCase } from '../../../../src/modules/iam/application/use-cases/iniciar-mfa.use-case';
import { RenovarSesionUseCase } from '../../../../src/modules/iam/application/use-cases/renovar-sesion.use-case';
import { ValidarAccesoUseCase } from '../../../../src/modules/iam/application/use-cases/validar-acceso.use-case';
import { DispositivoFamiliar } from '../../../../src/modules/iam/domain/entities/dispositivo-familiar';
import { CredencialesInvalidasError } from '../../../../src/modules/iam/domain/errors/credenciales-invalidas-error';
import {
  CodigoMfaInvalidoError,
  CodigoMfaRequeridoError,
  CuentaNoVerificadaError,
  CuentaSuspendidaError,
  SesionInvalidaError,
} from '../../../../src/modules/iam/domain/errors/errores-iam';
import { PerfilBloqueadoError } from '../../../../src/modules/iam/domain/errors/perfil-bloqueado-error';
import { PinIncorrectoError } from '../../../../src/modules/iam/domain/errors/pin-incorrecto-error';
import { EVENTOS_IAM } from '../../../../src/modules/iam/domain/events/eventos-iam';
import { crearEntorno, cuentaActiva, Entorno, perfilEstudiante } from '../dobles';

const CONTRASENA = 'Lectura-Segura-2026';

describe('AutenticarAdulto (RF-003, RF-009, RF-011)', () => {
  let e: Entorno;
  let caso: AutenticarAdultoUseCase;

  beforeEach(() => {
    e = crearEntorno();
    caso = new AutenticarAdultoUseCase(e.cuentas, e.hash, e.totp, e.emisor);
  });

  it('happy path: emite tokens, abre sesión y dirige a la ruta del rol', async () => {
    const cuenta = await cuentaActiva(e, { email: 'ana@lectoaventura.test', rol: 'DOCENTE' });
    const r = await caso.ejecutar({ email: '  ANA@lectoaventura.test ', contrasena: CONTRASENA });

    expect(r.rol).toBe('DOCENTE');
    expect(r.rutaInicial).toBe('/docente');
    expect(r.expiraEnMin).toBe(15);
    expect(e.tokens.verificarAccessToken(r.accessToken)?.sub).toBe(cuenta.id);
    const [sesion] = [...e.sesiones.filas.values()];
    expect(sesion?.hashRefreshToken).toBe(e.tokens.huella(r.refreshToken));
  });

  it('el mismo error para correo inexistente o contraseña incorrecta (no revela cuentas)', async () => {
    await cuentaActiva(e, { email: 'ana@lectoaventura.test' });
    await expect(caso.ejecutar({ email: 'nadie@lectoaventura.test', contrasena: CONTRASENA })).rejects.toThrow(
      CredencialesInvalidasError,
    );
    await expect(caso.ejecutar({ email: 'ana@lectoaventura.test', contrasena: 'otra-clave-123' })).rejects.toThrow(
      CredencialesInvalidasError,
    );
  });

  it('rechaza cuentas sin verificar y suspendidas', async () => {
    await cuentaActiva(e, { email: 'p@lectoaventura.test', verificada: false });
    await expect(caso.ejecutar({ email: 'p@lectoaventura.test', contrasena: CONTRASENA })).rejects.toThrow(CuentaNoVerificadaError);

    const suspendida = await cuentaActiva(e, { email: 's@lectoaventura.test' });
    suspendida.suspender();
    await expect(caso.ejecutar({ email: 's@lectoaventura.test', contrasena: CONTRASENA })).rejects.toThrow(CuentaSuspendidaError);
  });

  it('con MFA activo exige un código válido', async () => {
    const cuenta = await cuentaActiva(e, { email: 'mfa@lectoaventura.test', rol: 'EDITOR' });
    cuenta.iniciarMfa('SECRETO');
    cuenta.confirmarMfa();

    await expect(caso.ejecutar({ email: 'mfa@lectoaventura.test', contrasena: CONTRASENA })).rejects.toThrow(CodigoMfaRequeridoError);
    await expect(
      caso.ejecutar({ email: 'mfa@lectoaventura.test', contrasena: CONTRASENA, codigoMfa: '000000' }),
    ).rejects.toThrow(CodigoMfaInvalidoError);

    const r = await caso.ejecutar({ email: 'mfa@lectoaventura.test', contrasena: CONTRASENA, codigoMfa: '123456' });
    expect(e.tokens.verificarAccessToken(r.accessToken)?.mfa).toBe(true);
    expect(r.rutaInicial).toBe('/backoffice');
  });

  it('rol de backoffice sin MFA recibe sesión limitada que lleva a configurarlo', async () => {
    await cuentaActiva(e, { email: 'admin@lectoaventura.test', rol: 'ADMIN_PLATAFORMA' });
    const r = await caso.ejecutar({ email: 'admin@lectoaventura.test', contrasena: CONTRASENA });
    expect(r.requiereConfigurarMfa).toBe(true);
    expect(r.rutaInicial).toBe('/backoffice/mfa');
    expect(e.tokens.verificarAccessToken(r.accessToken)?.mfa).toBe(false);
  });
});

describe('AutenticarEstudiante (RF-007, RF-008, RN-03, RN-04)', () => {
  let e: Entorno;
  let caso: AutenticarEstudianteUseCase;

  beforeEach(() => {
    e = crearEntorno();
    caso = new AutenticarEstudianteUseCase(e.perfiles, e.dispositivos, e.hash, e.tokens, e.emisor, e.bus, e.reloj.ahora);
  });

  async function dispositivoDe(cuentaId: string, token = 'token-tablet') {
    await e.dispositivos.guardar(
      DispositivoFamiliar.vincular({ id: e.generarId(), cuentaId, nombre: 'Tablet', hashToken: e.tokens.huella(token), ahora: e.reloj.ahora() }),
    );
    return token;
  }

  it('happy path: dispositivo vinculado + PIN correcto → rol ESTUDIANTE', async () => {
    const familia = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, familia.id);
    const token = await dispositivoDe(familia.id);

    const r = await caso.ejecutar({ perfilId: perfil.id, pin: '2580', contexto: { tipo: 'DISPOSITIVO', tokenDispositivo: token } });
    expect(r.rol).toBe('ESTUDIANTE');
    expect(r.rutaInicial).toBe('/estudiante');
  });

  it('rechaza un dispositivo vinculado a otra familia', async () => {
    const familia = await cuentaActiva(e);
    const otra = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, familia.id);
    const tokenAjeno = await dispositivoDe(otra.id, 'token-ajeno');

    await expect(
      caso.ejecutar({ perfilId: perfil.id, pin: '2580', contexto: { tipo: 'DISPOSITIVO', tokenDispositivo: tokenAjeno } }),
    ).rejects.toThrow(/no está vinculado a tu familia/);
  });

  it('informa intentos restantes y bloquea al quinto error, publicando el evento', async () => {
    const familia = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, familia.id);
    const ctx = { tipo: 'AULA_VALIDADA' as const, aulaId: 'a1' };

    for (let restantes = 4; restantes >= 1; restantes--) {
      const error = await caso.ejecutar({ perfilId: perfil.id, pin: '9090', contexto: ctx }).catch((err) => err);
      expect(error).toBeInstanceOf(PinIncorrectoError);
      expect(error.detalle).toEqual({ intentosRestantes: restantes });
    }
    await expect(caso.ejecutar({ perfilId: perfil.id, pin: '9090', contexto: ctx })).rejects.toThrow(PerfilBloqueadoError);
    expect(e.bus.nombres()).toContain(EVENTOS_IAM.ESTUDIANTE_BLOQUEADO);

    // Sexto intento con el PIN correcto durante el bloqueo: rechazado.
    await expect(caso.ejecutar({ perfilId: perfil.id, pin: '2580', contexto: ctx })).rejects.toThrow(PerfilBloqueadoError);
    // Pasados 15 minutos vuelve a poder entrar.
    e.reloj.avanzarMin(15);
    await expect(caso.ejecutar({ perfilId: perfil.id, pin: '2580', contexto: ctx })).resolves.toMatchObject({ rol: 'ESTUDIANTE' });
  });

  it('un perfil desactivado no puede entrar', async () => {
    const familia = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, familia.id);
    perfil.desactivar();
    await expect(
      caso.ejecutar({ perfilId: perfil.id, pin: '2580', contexto: { tipo: 'AULA_VALIDADA', aulaId: 'a1' } }),
    ).rejects.toThrow(PinIncorrectoError);
  });
});

describe('Sesiones: renovar, validar y cerrar (RF-003, RF-010)', () => {
  let e: Entorno;

  beforeEach(() => {
    e = crearEntorno();
  });

  it('renovar rota el refresh token: el anterior deja de servir', async () => {
    const abierta = await e.emisor.abrir({ sujetoId: 'c1', rol: 'FAMILIAR', mfa: false });
    const renovar = new RenovarSesionUseCase(e.sesiones, e.tokens, e.emisor, e.reloj.ahora);

    const nueva = await renovar.ejecutar(abierta.refreshToken);
    expect(nueva.refreshToken).not.toBe(abierta.refreshToken);
    await expect(renovar.ejecutar(abierta.refreshToken)).rejects.toThrow(SesionInvalidaError);
    await expect(renovar.ejecutar(undefined)).rejects.toThrow(SesionInvalidaError);
  });

  it('validar acceso: firma inválida, sesión revocada e inactividad del estudiante', async () => {
    const validar = new ValidarAccesoUseCase(e.sesiones, e.tokens, e.reloj.ahora);
    const cerrar = new CerrarSesionUseCase(e.sesiones, e.reloj.ahora);

    await expect(validar.ejecutar('token-manipulado')).rejects.toThrow(SesionInvalidaError);

    const adulto = await e.emisor.abrir({ sujetoId: 'c1', rol: 'FAMILIAR', mfa: false });
    await expect(validar.ejecutar(adulto.accessToken)).resolves.toMatchObject({ sub: 'c1', rol: 'FAMILIAR' });
    const sid = e.tokens.verificarAccessToken(adulto.accessToken)!.sid;
    await cerrar.ejecutar(sid);
    await expect(validar.ejecutar(adulto.accessToken)).rejects.toThrow(/sesión se cerró/);

    const estudiante = await e.emisor.abrir({ sujetoId: 'p1', rol: 'ESTUDIANTE', mfa: false });
    e.reloj.avanzarMin(11);
    await expect(validar.ejecutar(estudiante.accessToken)).rejects.toThrow(/inactividad/);
  });

  it('la sesión de otro sujeto con el mismo sid no es válida', async () => {
    const validar = new ValidarAccesoUseCase(e.sesiones, e.tokens, e.reloj.ahora);
    const real = await e.emisor.abrir({ sujetoId: 'c1', rol: 'FAMILIAR', mfa: false });
    const sid = e.tokens.verificarAccessToken(real.accessToken)!.sid;
    const falsificado = e.tokens.emitirAccessToken({ sub: 'otro', rol: 'ADMIN_PLATAFORMA', mfa: true, sid });
    await expect(validar.ejecutar(falsificado)).rejects.toThrow(SesionInvalidaError);
  });
});

describe('MFA en dos pasos (RF-011)', () => {
  it('iniciar genera secreto pendiente; confirmar con código válido eleva la sesión', async () => {
    const e = crearEntorno();
    const cuenta = await cuentaActiva(e, { rol: 'REVISOR' });
    const sesion = await e.emisor.abrir({ sujetoId: cuenta.id, rol: 'REVISOR', mfa: false, requiereConfigurarMfa: true });
    const sid = e.tokens.verificarAccessToken(sesion.accessToken)!.sid;

    const inicio = await new IniciarMfaUseCase(e.cuentas, e.totp).ejecutar(cuenta.id);
    expect(inicio.urlOtpauth).toContain('otpauth://totp/');

    const configurar = new ConfigurarMfaUseCase(e.cuentas, e.sesiones, e.totp, e.tokens, e.emisor, e.bus, e.reloj.ahora);
    await expect(configurar.ejecutar({ cuentaId: cuenta.id, sesionId: sid, codigo: '999999' })).rejects.toThrow(CodigoMfaInvalidoError);

    const elevada = await configurar.ejecutar({ cuentaId: cuenta.id, sesionId: sid, codigo: '123456' });
    expect(e.tokens.verificarAccessToken(elevada.accessToken)?.mfa).toBe(true);
    expect(elevada.rutaInicial).toBe('/backoffice');
    expect(cuenta.mfaHabilitado).toBe(true);
    expect(e.bus.nombres()).toContain(EVENTOS_IAM.MFA_CONFIGURADO);
  });
});
