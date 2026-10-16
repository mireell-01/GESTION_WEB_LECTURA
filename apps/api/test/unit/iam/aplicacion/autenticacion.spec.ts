import { beforeEach, describe, expect, it } from 'vitest';

import { AutenticarAdultoUseCase } from '../../../../src/modules/iam/application/use-cases/autenticar-adulto.use-case';
import { AutenticarEstudianteUseCase } from '../../../../src/modules/iam/application/use-cases/autenticar-estudiante.use-case';
import { CerrarSesionUseCase } from '../../../../src/modules/iam/application/use-cases/cerrar-sesion.use-case';
import { ConfigurarMfaUseCase } from '../../../../src/modules/iam/application/use-cases/configurar-mfa.use-case';
import { ContextoIngresoUseCase } from '../../../../src/modules/iam/application/use-cases/contexto-ingreso.use-case';
import { IniciarMfaUseCase } from '../../../../src/modules/iam/application/use-cases/iniciar-mfa.use-case';
import { RenovarSesionUseCase } from '../../../../src/modules/iam/application/use-cases/renovar-sesion.use-case';
import { ValidarAccesoUseCase } from '../../../../src/modules/iam/application/use-cases/validar-acceso.use-case';
import { DispositivoIngreso } from '../../../../src/modules/iam/domain/entities/dispositivo-ingreso';
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
import { ProhibidoError } from '../../../../src/modules/shared-kernel/public-api';
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
    await expect(caso.ejecutar({ email: 'nadie@lectoaventura.test', contrasena: CONTRASENA })).rejects.toThrow(CredencialesInvalidasError);
    await expect(caso.ejecutar({ email: 'ana@lectoaventura.test', contrasena: 'otra-clave-123' })).rejects.toThrow(CredencialesInvalidasError);
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
    await expect(caso.ejecutar({ email: 'mfa@lectoaventura.test', contrasena: CONTRASENA, codigoMfa: '000000' })).rejects.toThrow(
      CodigoMfaInvalidoError,
    );

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

describe('AutenticarEstudiante y contexto de ingreso (RF-007, RF-008, RN-03, RN-04, CR-01)', () => {
  let e: Entorno;
  let caso: AutenticarEstudianteUseCase;
  let contexto: ContextoIngresoUseCase;

  beforeEach(() => {
    e = crearEntorno();
    caso = new AutenticarEstudianteUseCase(e.perfiles, e.dispositivos, e.contextoAula, e.hash, e.tokens, e.emisor, e.bus, e.reloj.ahora);
    contexto = new ContextoIngresoUseCase(e.perfiles, e.dispositivos, e.contextoAula, e.tokens, e.reloj.ahora);
  });

  /** Tablet activada por un adulto: de su familia o, con aulaId, de su aula (CR-01). */
  async function tabletDe(cuentaId: string, opciones: { token?: string; aulaId?: string } = {}) {
    const token = opciones.token ?? 'token-tablet';
    await e.dispositivos.guardar(
      DispositivoIngreso.activar({
        id: e.generarId(),
        cuentaId,
        contexto: opciones.aulaId ? { tipo: 'AULA', aulaId: opciones.aulaId } : { tipo: 'FAMILIA' },
        nombre: '',
        hashToken: e.tokens.huella(token),
        ahora: e.reloj.ahora(),
      }),
    );
    return token;
  }

  it('tablet de la familia + PIN correcto → rol ESTUDIANTE', async () => {
    const familia = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, familia.id);
    const token = await tabletDe(familia.id);

    expect(await contexto.deDispositivo(token)).toEqual({
      contexto: { tipo: 'FAMILIA', nombre: 'Tu familia' },
      estudiantes: [{ id: perfil.id, alias: 'Lucía', avatar: 'zorro' }],
    });
    const r = await caso.ejecutar({ perfilId: perfil.id, pin: '2580', tokenDispositivo: token });
    expect(r.rol).toBe('ESTUDIANTE');
    expect(r.rutaInicial).toBe('/estudiante');
  });

  it('rechaza la tablet de otra familia', async () => {
    const familia = await cuentaActiva(e);
    const otra = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, familia.id);
    const tokenAjeno = await tabletDe(otra.id, { token: 'token-ajeno' });

    await expect(caso.ejecutar({ perfilId: perfil.id, pin: '2580', tokenDispositivo: tokenAjeno })).rejects.toThrow(
      /no está activada para tu familia/,
    );
  });

  it('tablet del aula: sin código, muestra solo a los matriculados y valida la matrícula al entrar', async () => {
    const docente = await cuentaActiva(e, { rol: 'DOCENTE' });
    const ana = await perfilEstudiante(e, docente.id, { alias: 'Ana' });
    const beto = await perfilEstudiante(e, docente.id, { alias: 'Beto', avatar: 'panda' });
    e.contextoAula.agregarAula('aula-1', { docenteId: docente.id, estudiantes: [ana.id] });
    const token = await tabletDe(docente.id, { aulaId: 'aula-1' });

    expect(await contexto.deDispositivo(token)).toEqual({
      contexto: { tipo: 'AULA', nombre: '3.° B' },
      estudiantes: [{ id: ana.id, alias: 'Ana', avatar: 'zorro' }],
    });
    await expect(caso.ejecutar({ perfilId: ana.id, pin: '2580', tokenDispositivo: token })).resolves.toMatchObject({ rol: 'ESTUDIANTE' });
    await expect(caso.ejecutar({ perfilId: beto.id, pin: '2580', tokenDispositivo: token })).rejects.toThrow(/No perteneces a esta aula/);
  });

  it('al archivar el aula, su tablet deja de mostrar avatares y de dejar entrar', async () => {
    const docente = await cuentaActiva(e, { rol: 'DOCENTE' });
    const ana = await perfilEstudiante(e, docente.id, { alias: 'Ana' });
    e.contextoAula.agregarAula('aula-1', { docenteId: docente.id, estudiantes: [ana.id] });
    const token = await tabletDe(docente.id, { aulaId: 'aula-1' });
    e.contextoAula.archivar('aula-1');

    await expect(contexto.deDispositivo(token)).rejects.toThrow(ProhibidoError);
    await expect(caso.ejecutar({ perfilId: ana.id, pin: '2580', tokenDispositivo: token })).rejects.toThrow(ProhibidoError);
  });

  it('sin tablet activada, desconocida o vencida (30 días) no se muestran avatares ni se entra', async () => {
    const familia = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, familia.id);
    const token = await tabletDe(familia.id);

    await expect(contexto.deDispositivo(undefined)).rejects.toThrow(/no está activada/);
    await expect(contexto.deDispositivo('token-desconocido')).rejects.toThrow(ProhibidoError);
    await expect(caso.ejecutar({ perfilId: perfil.id, pin: '2580', tokenDispositivo: 'token-desconocido' })).rejects.toThrow(ProhibidoError);
    e.reloj.avanzarMin(30 * 24 * 60);
    await expect(contexto.deDispositivo(token)).rejects.toThrow(ProhibidoError);
    await expect(caso.ejecutar({ perfilId: perfil.id, pin: '2580', tokenDispositivo: token })).rejects.toThrow(ProhibidoError);
  });

  it('informa intentos restantes y bloquea al quinto error, publicando el evento', async () => {
    const docente = await cuentaActiva(e, { rol: 'DOCENTE' });
    const perfil = await perfilEstudiante(e, docente.id);
    e.contextoAula.agregarAula('a1', { docenteId: docente.id, estudiantes: [perfil.id] });
    const tokenDispositivo = await tabletDe(docente.id, { aulaId: 'a1' });

    for (let restantes = 4; restantes >= 1; restantes--) {
      const error = await caso.ejecutar({ perfilId: perfil.id, pin: '9090', tokenDispositivo }).catch((err) => err);
      expect(error).toBeInstanceOf(PinIncorrectoError);
      expect(error.detalle).toEqual({ intentosRestantes: restantes });
    }
    await expect(caso.ejecutar({ perfilId: perfil.id, pin: '9090', tokenDispositivo })).rejects.toThrow(PerfilBloqueadoError);
    expect(e.bus.nombres()).toContain(EVENTOS_IAM.ESTUDIANTE_BLOQUEADO);

    // Sexto intento con el PIN correcto durante el bloqueo: rechazado.
    await expect(caso.ejecutar({ perfilId: perfil.id, pin: '2580', tokenDispositivo })).rejects.toThrow(PerfilBloqueadoError);
    // Pasados 15 minutos vuelve a poder entrar.
    e.reloj.avanzarMin(15);
    await expect(caso.ejecutar({ perfilId: perfil.id, pin: '2580', tokenDispositivo })).resolves.toMatchObject({ rol: 'ESTUDIANTE' });
  });

  it('un perfil desactivado no puede entrar', async () => {
    const familia = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, familia.id);
    const token = await tabletDe(familia.id);
    perfil.desactivar();
    await expect(caso.ejecutar({ perfilId: perfil.id, pin: '2580', tokenDispositivo: token })).rejects.toThrow(PinIncorrectoError);
  });
});

describe('Sesiones: renovar, validar y cerrar (RF-003, RF-010, ADR-005)', () => {
  let e: Entorno;
  let renovar: RenovarSesionUseCase;

  beforeEach(() => {
    e = crearEntorno();
    renovar = new RenovarSesionUseCase(e.sesiones, e.tokens, e.emisor, e.bus, e.reloj.ahora);
  });

  it('renovar rota el refresh token: el anterior deja de servir', async () => {
    const abierta = await e.emisor.abrir({ sujetoId: 'c1', rol: 'FAMILIAR', mfa: false });
    const nueva = await renovar.ejecutar(abierta.refreshToken);
    expect(nueva.refreshToken).not.toBe(abierta.refreshToken);
    await expect(renovar.ejecutar(undefined)).rejects.toThrow(SesionInvalidaError);
  });

  it('ADR-005: reutilizar un refresh token ya rotado revoca la sesión entera y lo registra', async () => {
    const abierta = await e.emisor.abrir({ sujetoId: 'c1', rol: 'FAMILIAR', mfa: false });
    const legitima = await renovar.ejecutar(abierta.refreshToken);

    // Un atacante usa el token viejo que copió: se rechaza y se cierra la sesión.
    await expect(renovar.ejecutar(abierta.refreshToken)).rejects.toThrow(SesionInvalidaError);
    expect(e.bus.nombres()).toContain(EVENTOS_IAM.REUTILIZACION_REFRESH);
    // Por eso tampoco sirve ya el token legítimo más reciente: hay que volver a ingresar.
    await expect(renovar.ejecutar(legitima.refreshToken)).rejects.toThrow(SesionInvalidaError);
  });

  it('un token desconocido (nunca emitido) no revoca nada', async () => {
    await e.emisor.abrir({ sujetoId: 'c1', rol: 'FAMILIAR', mfa: false });
    await expect(renovar.ejecutar('token-inventado')).rejects.toThrow(SesionInvalidaError);
    expect(e.bus.nombres()).not.toContain(EVENTOS_IAM.REUTILIZACION_REFRESH);
  });

  it('ADR-005: la sesión del estudiante dura como máximo 8 h aunque haya actividad', async () => {
    const abierta = await e.emisor.abrir({ sujetoId: 'p1', rol: 'ESTUDIANTE', mfa: false });
    let refresh = abierta.refreshToken;
    // Actividad cada 9 minutos durante 7 h 57 min: la sesión sigue viva.
    for (let i = 0; i < 53; i++) {
      e.reloj.avanzarMin(9);
      refresh = (await renovar.ejecutar(refresh)).refreshToken;
    }
    e.reloj.avanzarMin(9); // 8 h 6 min desde el ingreso
    await expect(renovar.ejecutar(refresh)).rejects.toThrow(SesionInvalidaError);
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
    // El refresh anterior a elevar la sesión ya no sirve (se rotó y quedó registrado).
    const renovar = new RenovarSesionUseCase(e.sesiones, e.tokens, e.emisor, e.bus, e.reloj.ahora);
    await expect(renovar.ejecutar(sesion.refreshToken)).rejects.toThrow(SesionInvalidaError);
  });
});
