import { beforeEach, describe, expect, it } from 'vitest';

import { AdministrarDocentesUseCase } from '../../../../src/modules/iam/application/use-cases/administrar-docentes.use-case';
import { AutenticarAdultoUseCase } from '../../../../src/modules/iam/application/use-cases/autenticar-adulto.use-case';
import { RestablecerContrasenaUseCase } from '../../../../src/modules/iam/application/use-cases/restablecer-contrasena.use-case';
import { ValidarAccesoUseCase } from '../../../../src/modules/iam/application/use-cases/validar-acceso.use-case';
import { EnlaceInvalidoError } from '../../../../src/modules/iam/domain/errors/enlace-invalido-error';
import { CuentaSuspendidaError, EmailYaRegistradoError, SesionInvalidaError } from '../../../../src/modules/iam/domain/errors/errores-iam';
import { EVENTOS_IAM } from '../../../../src/modules/iam/domain/events/eventos-iam';
import { NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntorno, cuentaActiva, Entorno } from '../dobles';

/** Nivel 1 — RF-076 (Módulo 12): la administración da de alta, suspende y reactiva cuentas docentes. */
const URL_WEB = 'http://localhost:3002';
const ADMIN = 'admin-1';
const CONTRASENA = 'Lectura-Segura-2026';

describe('[IAM][Core][Fast] Gestión de cuentas docentes por la administración (RF-076)', () => {
  let e: Entorno;
  let gestion: AdministrarDocentesUseCase;
  let ingresar: AutenticarAdultoUseCase;
  let restablecer: RestablecerContrasenaUseCase;
  let validar: ValidarAccesoUseCase;

  beforeEach(() => {
    e = crearEntorno();
    gestion = new AdministrarDocentesUseCase(e.cuentas, e.verificaciones, e.hash, e.tokens, e.sesiones, e.correo, e.bus, URL_WEB, e.generarId, e.reloj.ahora);
    ingresar = new AutenticarAdultoUseCase(e.cuentas, e.hash, e.totp, e.emisor);
    restablecer = new RestablecerContrasenaUseCase(e.cuentas, e.verificaciones, e.hash, e.filtradas, e.tokens, e.sesiones, e.bus, e.reloj.ahora);
    validar = new ValidarAccesoUseCase(e.sesiones, e.tokens, e.reloj.ahora);
  });

  const codigoDelCorreo = () => new URL(e.correo.enviados.at(-1)?.enlace as string).searchParams.get('codigo') as string;

  it('alta: la cuenta nace sin contraseña conocida y el docente la crea con un enlace de 72 horas', async () => {
    const d = await gestion.darDeAlta({ nombre: 'Rosa Pérez', email: ' Rosa@IE70001.edu.pe ', adminId: ADMIN });
    expect(d).toMatchObject({ nombre: 'Rosa Pérez', email: 'rosa@ie70001.edu.pe', estado: 'PENDIENTE_VERIFICACION' });
    const [correo] = e.correo.enviados;
    expect(correo).toMatchObject({ para: 'rosa@ie70001.edu.pe', asunto: 'Tu cuenta de docente en LectoAventura' });
    expect(correo?.texto).toContain('vence en 72 horas');
    expect(correo?.enlace).toMatch(/^http:\/\/localhost:3002\/restablecer\?codigo=/);
    expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_IAM.DOCENTE_DADO_DE_ALTA, agregadoId: d.id, datos: { actorId: ADMIN, rol: 'ADMIN_PLATAFORMA' } });
    await expect(ingresar.ejecutar({ email: 'rosa@ie70001.edu.pe', contrasena: CONTRASENA })).rejects.toThrow();

    // 71 horas después todavía sirve; al crear su contraseña su correo queda verificado y ya ingresa.
    e.reloj.avanzarMin(71 * 60);
    await restablecer.ejecutar({ codigo: codigoDelCorreo(), contrasenaNueva: CONTRASENA });
    expect((await gestion.docente(d.id)).estado).toBe('ACTIVA');
    expect((await ingresar.ejecutar({ email: 'rosa@ie70001.edu.pe', contrasena: CONTRASENA })).rol).toBe('DOCENTE');
  });

  it('el enlace del alta vence a las 72 horas', async () => {
    await gestion.darDeAlta({ nombre: 'Rosa Pérez', email: 'rosa@ie70001.edu.pe', adminId: ADMIN });
    e.reloj.avanzarMin(72 * 60 + 1);
    await expect(restablecer.ejecutar({ codigo: codigoDelCorreo(), contrasenaNueva: CONTRASENA })).rejects.toThrow(EnlaceInvalidoError);
  });

  it('un correo ya registrado no se da de alta otra vez', async () => {
    await cuentaActiva(e, { email: 'rosa@ie70001.edu.pe', rol: 'DOCENTE' });
    await expect(gestion.darDeAlta({ nombre: 'Rosa Pérez', email: 'rosa@ie70001.edu.pe', adminId: ADMIN })).rejects.toThrow(EmailYaRegistradoError);
    expect(e.correo.enviados).toHaveLength(0);
  });

  it('suspender: pierde el acceso al instante (sus sesiones se cierran) y ya no puede ingresar', async () => {
    const cuenta = await cuentaActiva(e, { email: 'rosa@ie70001.edu.pe', rol: 'DOCENTE' });
    const sesion = await ingresar.ejecutar({ email: 'rosa@ie70001.edu.pe', contrasena: CONTRASENA });
    expect((await validar.ejecutar(sesion.accessToken)).sub).toBe(cuenta.id);

    expect(await gestion.suspender(cuenta.id, ADMIN)).toMatchObject({ estado: 'SUSPENDIDA' });
    await expect(validar.ejecutar(sesion.accessToken)).rejects.toThrow(SesionInvalidaError);
    await expect(ingresar.ejecutar({ email: 'rosa@ie70001.edu.pe', contrasena: CONTRASENA })).rejects.toThrow(CuentaSuspendidaError);

    // Suspender de nuevo no cambia nada ni se anuncia dos veces.
    await gestion.suspender(cuenta.id, ADMIN);
    expect(e.bus.nombres().filter((n) => n === EVENTOS_IAM.CUENTA_SUSPENDIDA)).toHaveLength(1);
    expect(e.bus.publicados.at(-1)).toMatchObject({ datos: { actorId: ADMIN, rol: 'ADMIN_PLATAFORMA' } });
  });

  it('reactivar: vuelve a ingresar con su contraseña de siempre', async () => {
    const cuenta = await cuentaActiva(e, { email: 'rosa@ie70001.edu.pe', rol: 'DOCENTE' });
    await gestion.suspender(cuenta.id, ADMIN);
    expect(await gestion.reactivar(cuenta.id, ADMIN)).toMatchObject({ estado: 'ACTIVA' });
    expect((await ingresar.ejecutar({ email: 'rosa@ie70001.edu.pe', contrasena: CONTRASENA })).rol).toBe('DOCENTE');
    await gestion.reactivar(cuenta.id, ADMIN);
    expect(e.bus.nombres().filter((n) => n === EVENTOS_IAM.CUENTA_REACTIVADA)).toHaveLength(1);
  });

  it('solo cuentas docentes: una familia, un editor o un id inexistente responden como si no existieran', async () => {
    const familia = await cuentaActiva(e, { rol: 'FAMILIAR' });
    const editor = await cuentaActiva(e, { rol: 'EDITOR' });
    for (const id of [familia.id, editor.id, 'no-existe']) {
      await expect(gestion.suspender(id, ADMIN)).rejects.toThrow(NoEncontradoError);
      await expect(gestion.docente(id)).rejects.toThrow('Docente no encontrado');
    }
    expect(familia.estaActiva()).toBe(true);
  });

  it('lista solo docentes, con su estado y sin datos de acceso', async () => {
    const rosa = await cuentaActiva(e, { email: 'rosa@ie70001.edu.pe', rol: 'DOCENTE' });
    const luis = await cuentaActiva(e, { email: 'luis@ie70001.edu.pe', rol: 'DOCENTE' });
    await cuentaActiva(e, { rol: 'FAMILIAR' });
    await gestion.suspender(luis.id, ADMIN);
    const todos = await gestion.listar();
    expect(todos.map((d) => d.email).sort()).toEqual(['luis@ie70001.edu.pe', 'rosa@ie70001.edu.pe']);
    expect(Object.keys(todos[0] as object).sort()).toEqual(['creadoEn', 'email', 'estado', 'id', 'nombre']);
    expect((await gestion.listar({ estado: 'SUSPENDIDA' })).map((d) => d.id)).toEqual([luis.id]);
    expect((await gestion.listar({ estado: 'ACTIVA' })).map((d) => d.id)).toEqual([rosa.id]);
  });
});
