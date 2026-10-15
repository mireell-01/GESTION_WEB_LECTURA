import { beforeEach, describe, expect, it } from 'vitest';

import { ActualizarPerfilUseCase } from '../../../../src/modules/iam/application/use-cases/actualizar-perfil.use-case';
import {
  CrearPerfilEstudianteUseCase,
  MAX_PERFILES_FAMILIA,
} from '../../../../src/modules/iam/application/use-cases/crear-perfil-estudiante.use-case';
import { ExportarDatosUseCase } from '../../../../src/modules/iam/application/use-cases/exportar-datos.use-case';
import { PerfilesDeDispositivoUseCase } from '../../../../src/modules/iam/application/use-cases/perfiles-de-dispositivo.use-case';
import { RecuperarContrasenaUseCase } from '../../../../src/modules/iam/application/use-cases/recuperar-contrasena.use-case';
import { RegistrarConsentimientoUseCase } from '../../../../src/modules/iam/application/use-cases/registrar-consentimiento.use-case';
import { RegistrarCuentaUseCase } from '../../../../src/modules/iam/application/use-cases/registrar-cuenta.use-case';
import { RestablecerContrasenaUseCase } from '../../../../src/modules/iam/application/use-cases/restablecer-contrasena.use-case';
import { RestablecerPinUseCase } from '../../../../src/modules/iam/application/use-cases/restablecer-pin.use-case';
import { SolicitarEliminacionUseCase } from '../../../../src/modules/iam/application/use-cases/solicitar-eliminacion.use-case';
import { VerificarCorreoUseCase } from '../../../../src/modules/iam/application/use-cases/verificar-correo.use-case';
import { VincularDispositivoUseCase } from '../../../../src/modules/iam/application/use-cases/vincular-dispositivo.use-case';
import { ConsentimientoRequeridoError } from '../../../../src/modules/iam/domain/errors/consentimiento-requerido-error';
import { EnlaceInvalidoError } from '../../../../src/modules/iam/domain/errors/enlace-invalido-error';
import {
  AliasRepetidoError,
  ContrasenaFiltradaError,
  EmailYaRegistradoError,
  LimitePerfilesError,
} from '../../../../src/modules/iam/domain/errors/errores-iam';
import { EVENTOS_IAM } from '../../../../src/modules/iam/domain/events/eventos-iam';
import { NoEncontradoError, ProhibidoError } from '../../../../src/modules/shared-kernel/public-api';
import { consentimientoParental, crearEntorno, cuentaActiva, Entorno, perfilEstudiante } from '../dobles';

const URL_WEB = 'http://localhost:3002';

function codigoDelEnlace(enlace: string | undefined): string {
  return new URL(enlace as string).searchParams.get('codigo') as string;
}

describe('Registro y verificación de cuenta (RF-001, RF-002)', () => {
  let e: Entorno;
  let registrar: RegistrarCuentaUseCase;
  let verificar: VerificarCorreoUseCase;

  beforeEach(() => {
    e = crearEntorno();
    registrar = new RegistrarCuentaUseCase(
      e.cuentas, e.verificaciones, e.hash, e.filtradas, e.tokens, e.correo, e.bus, URL_WEB, e.generarId, e.reloj.ahora,
    );
    verificar = new VerificarCorreoUseCase(e.cuentas, e.verificaciones, e.tokens, e.bus, e.reloj.ahora);
  });

  const datos = { nombre: 'Rosa Demo', email: 'Rosa@LectoAventura.test', contrasena: 'Lectura-Segura-2026', rol: 'FAMILIAR' as const };

  it('crea la cuenta pendiente, guarda solo la huella del enlace y envía el correo', async () => {
    const r = await registrar.ejecutar(datos);
    expect(r.estado).toBe('PENDIENTE_VERIFICACION');

    const [correo] = e.correo.enviados;
    expect(correo?.para).toBe('rosa@lectoaventura.test');
    expect(correo?.enlace).toMatch(/^http:\/\/localhost:3002\/verificar\?codigo=/);

    const codigo = codigoDelEnlace(correo?.enlace);
    const [guardada] = [...e.verificaciones.filas.values()];
    expect(guardada?.codigo.value).toBe(e.tokens.huella(codigo));
    expect(guardada?.codigo.value).not.toBe(codigo);
    expect(e.bus.nombres()).toEqual([EVENTOS_IAM.CUENTA_CREADA]);
  });

  it('rechaza correo repetido y contraseña filtrada', async () => {
    await registrar.ejecutar(datos);
    await expect(registrar.ejecutar(datos)).rejects.toThrow(EmailYaRegistradoError);
    await expect(
      registrar.ejecutar({ ...datos, email: 'otra@lectoaventura.test', contrasena: 'contrasena-filtrada' }),
    ).rejects.toThrow(ContrasenaFiltradaError);
  });

  it('el enlace activa la cuenta una sola vez y vence a las 24 h', async () => {
    const { cuentaId } = await registrar.ejecutar(datos);
    const codigo = codigoDelEnlace(e.correo.enviados[0]?.enlace);

    await verificar.ejecutar(codigo);
    expect((await e.cuentas.buscarPorId(cuentaId))?.estaActiva()).toBe(true);
    await expect(verificar.ejecutar(codigo)).rejects.toThrow(EnlaceInvalidoError);

    await registrar.ejecutar({ ...datos, email: 'tarde@lectoaventura.test' });
    const codigoTarde = codigoDelEnlace(e.correo.enviados[1]?.enlace);
    e.reloj.avanzarMin(24 * 60 + 1);
    await expect(verificar.ejecutar(codigoTarde)).rejects.toThrow(EnlaceInvalidoError);
  });
});

describe('Recuperación de contraseña (RF-004)', () => {
  it('responde igual exista o no la cuenta, pero solo envía correo si existe', async () => {
    const e = crearEntorno();
    await cuentaActiva(e, { email: 'ana@lectoaventura.test' });
    const recuperar = new RecuperarContrasenaUseCase(e.cuentas, e.verificaciones, e.tokens, e.correo, URL_WEB, e.generarId, e.reloj.ahora);

    expect(await recuperar.ejecutar('ana@lectoaventura.test')).toEqual({ ok: true });
    expect(await recuperar.ejecutar('nadie@lectoaventura.test')).toEqual({ ok: true });
    expect(e.correo.enviados).toHaveLength(1);
  });

  it('restablecer cambia la contraseña, cierra sesiones y el enlace vence a los 30 min', async () => {
    const e = crearEntorno();
    const cuenta = await cuentaActiva(e, { email: 'ana@lectoaventura.test' });
    const recuperar = new RecuperarContrasenaUseCase(e.cuentas, e.verificaciones, e.tokens, e.correo, URL_WEB, e.generarId, e.reloj.ahora);
    const restablecer = new RestablecerContrasenaUseCase(
      e.cuentas, e.verificaciones, e.hash, e.filtradas, e.tokens, e.sesiones, e.bus, e.reloj.ahora,
    );
    const sesion = await e.emisor.abrir({ sujetoId: cuenta.id, rol: 'FAMILIAR', mfa: false });

    await recuperar.ejecutar('ana@lectoaventura.test');
    const codigo = codigoDelEnlace(e.correo.enviados[0]?.enlace);
    await restablecer.ejecutar({ codigo, contrasenaNueva: 'Nueva-Clave-Lectora-1' });

    expect(await e.hash.verificar('Nueva-Clave-Lectora-1', cuenta.hashContrasena)).toBe(true);
    const sid = e.tokens.verificarAccessToken(sesion.accessToken)!.sid;
    expect((await e.sesiones.buscarPorId(sid))?.revocadaEn).not.toBeNull();
    await expect(restablecer.ejecutar({ codigo, contrasenaNueva: 'Otra-Clave-Lectora-2' })).rejects.toThrow(EnlaceInvalidoError);

    await recuperar.ejecutar('ana@lectoaventura.test');
    const vencido = codigoDelEnlace(e.correo.enviados[1]?.enlace);
    e.reloj.avanzarMin(31);
    await expect(restablecer.ejecutar({ codigo: vencido, contrasenaNueva: 'Otra-Clave-Lectora-2' })).rejects.toThrow(EnlaceInvalidoError);
  });
});

describe('Consentimiento y perfiles de estudiante (RF-005, RF-006, RF-071, RN-01)', () => {
  let e: Entorno;
  let crear: CrearPerfilEstudianteUseCase;
  let consentir: RegistrarConsentimientoUseCase;
  const nuevo = { alias: 'Mateo', anioNacimiento: 2018, mesNacimiento: 5, avatar: 'leon', pin: '2580' };

  beforeEach(() => {
    e = crearEntorno();
    crear = new CrearPerfilEstudianteUseCase(e.cuentas, e.perfiles, e.consentimientos, e.hash, e.bus, e.generarId, e.reloj.ahora);
    consentir = new RegistrarConsentimientoUseCase(e.cuentas, e.consentimientos, e.bus, e.generarId, e.reloj.ahora);
  });

  it('sin consentimiento vigente la creación se rechaza', async () => {
    const familia = await cuentaActiva(e);
    await expect(crear.ejecutar({ cuentaResponsableId: familia.id, ...nuevo })).rejects.toThrow(ConsentimientoRequeridoError);
  });

  it('con consentimiento crea el perfil con PIN cifrado y rango de edad, sin exponer el hash', async () => {
    const familia = await cuentaActiva(e);
    const c = await consentir.ejecutar({ cuentaResponsableId: familia.id, tipo: 'PARENTAL', otorganteNombre: 'Ana Ríos', medio: 'DIGITAL' });
    expect(c.versionPolitica).toBe('2026-09');

    const vista = await crear.ejecutar({ cuentaResponsableId: familia.id, ...nuevo });
    expect(vista).toMatchObject({ alias: 'Mateo', rangoEdad: 'R2', activo: true });
    expect(vista).not.toHaveProperty('hashPin');
    expect((await e.perfiles.buscarPorId(vista.id))?.hashPin).toBe('hash:2580');
    expect(e.bus.nombres()).toContain(EVENTOS_IAM.PERFIL_CREADO);
  });

  it('el consentimiento repetido devuelve el vigente (idempotente)', async () => {
    const familia = await cuentaActiva(e);
    const a = await consentir.ejecutar({ cuentaResponsableId: familia.id, tipo: 'PARENTAL', otorganteNombre: 'Ana Ríos', medio: 'DIGITAL' });
    const b = await consentir.ejecutar({ cuentaResponsableId: familia.id, tipo: 'PARENTAL', otorganteNombre: 'Ana Ríos', medio: 'DIGITAL' });
    expect(b.id).toBe(a.id);
  });

  it(`máximo ${MAX_PERFILES_FAMILIA} perfiles por familia y alias+avatar no repetidos`, async () => {
    const familia = await cuentaActiva(e);
    await consentimientoParental(e, familia.id);
    const avatares = ['zorro', 'panda', 'leon', 'rana', 'pulpo', 'buho'];
    await crear.ejecutar({ cuentaResponsableId: familia.id, ...nuevo, alias: 'Uno', avatar: 'zorro' });
    await expect(
      crear.ejecutar({ cuentaResponsableId: familia.id, ...nuevo, alias: 'uno', avatar: 'zorro' }),
    ).rejects.toThrow(AliasRepetidoError);
    for (const [i, avatar] of avatares.slice(1).entries()) {
      await crear.ejecutar({ cuentaResponsableId: familia.id, ...nuevo, alias: `Hijo ${i}`, avatar });
    }
    await expect(crear.ejecutar({ cuentaResponsableId: familia.id, ...nuevo, alias: 'Séptimo' })).rejects.toThrow(LimitePerfilesError);
  });

  it('en aula exige el consentimiento institucional de esa aula y no aplica el límite familiar', async () => {
    const docente = await cuentaActiva(e, { rol: 'DOCENTE' });
    await expect(crear.ejecutar({ cuentaResponsableId: docente.id, aulaId: 'aula-1', ...nuevo })).rejects.toThrow(
      ConsentimientoRequeridoError,
    );
    await consentir.ejecutar({ cuentaResponsableId: docente.id, tipo: 'INSTITUCIONAL', aulaId: 'aula-1', otorganteNombre: 'Directora Ruiz', medio: 'FISICO' });
    await expect(crear.ejecutar({ cuentaResponsableId: docente.id, aulaId: 'aula-1', ...nuevo })).resolves.toMatchObject({ alias: 'Mateo' });
    await expect(crear.ejecutar({ cuentaResponsableId: docente.id, aulaId: 'aula-2', ...nuevo })).rejects.toThrow(ConsentimientoRequeridoError);
  });

  it('un docente no crea perfiles "de casa" ni registra consentimiento parental', async () => {
    const docente = await cuentaActiva(e, { rol: 'DOCENTE' });
    await expect(crear.ejecutar({ cuentaResponsableId: docente.id, ...nuevo })).rejects.toThrow(ProhibidoError);
    await expect(
      consentir.ejecutar({ cuentaResponsableId: docente.id, tipo: 'PARENTAL', otorganteNombre: 'Ana Ríos', medio: 'DIGITAL' }),
    ).rejects.toThrow(ProhibidoError);
  });
});

describe('Gestión del perfil por su responsable (RF-008, RF-012, RF-013, RF-071, RN-17)', () => {
  let e: Entorno;

  beforeEach(() => {
    e = crearEntorno();
  });

  it('un adulto no puede gestionar perfiles ajenos (404, no 403)', async () => {
    const duena = await cuentaActiva(e);
    const intrusa = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, duena.id);
    const restablecer = new RestablecerPinUseCase(e.perfiles, e.sesiones, e.hash, e.bus, e.reloj.ahora);
    await expect(restablecer.ejecutar({ cuentaId: intrusa.id, perfilId: perfil.id, pinNuevo: '3691' })).rejects.toThrow(NoEncontradoError);
  });

  it('restablecer PIN valida el nuevo PIN, cierra sesiones del estudiante y queda auditado', async () => {
    const familia = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, familia.id);
    const sesion = await e.emisor.abrir({ sujetoId: perfil.id, rol: 'ESTUDIANTE', mfa: false });
    const restablecer = new RestablecerPinUseCase(e.perfiles, e.sesiones, e.hash, e.bus, e.reloj.ahora);

    await expect(restablecer.ejecutar({ cuentaId: familia.id, perfilId: perfil.id, pinNuevo: '2018' })).rejects.toThrow(/fácil de adivinar/);
    await restablecer.ejecutar({ cuentaId: familia.id, perfilId: perfil.id, pinNuevo: '3691' });

    expect(perfil.hashPin).toBe('hash:3691');
    expect((await e.sesiones.buscarPorId(e.tokens.verificarAccessToken(sesion.accessToken)!.sid))?.revocadaEn).not.toBeNull();
    expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_IAM.PIN_RESTABLECIDO, datos: { actorId: familia.id } });
  });

  it('desactivar cierra sesiones y lo oculta del dispositivo; reactivar lo devuelve', async () => {
    const familia = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, familia.id);
    const actualizar = new ActualizarPerfilUseCase(e.perfiles, e.sesiones, e.bus, e.reloj.ahora);
    const vincular = new VincularDispositivoUseCase(e.cuentas, e.dispositivos, e.tokens, e.bus, e.generarId, e.reloj.ahora);
    const listar = new PerfilesDeDispositivoUseCase(e.dispositivos, e.perfiles, e.tokens, e.reloj.ahora);
    const { tokenDispositivo } = await vincular.ejecutar({ cuentaId: familia.id, nombre: 'Tablet' });

    expect(await listar.ejecutar(tokenDispositivo)).toHaveLength(1);
    await actualizar.ejecutar({ cuentaId: familia.id, perfilId: perfil.id, activo: false });
    expect(await listar.ejecutar(tokenDispositivo)).toHaveLength(0);
    await actualizar.ejecutar({ cuentaId: familia.id, perfilId: perfil.id, activo: true, avatar: 'panda' });
    expect(await listar.ejecutar(tokenDispositivo)).toEqual([{ id: perfil.id, alias: 'Lucía', avatar: 'panda' }]);
    await expect(listar.ejecutar('token-desconocido')).rejects.toThrow(ProhibidoError);
    await expect(listar.ejecutar(undefined)).rejects.toThrow(ProhibidoError);
  });

  it('solo una cuenta familiar puede vincular un dispositivo', async () => {
    const docente = await cuentaActiva(e, { rol: 'DOCENTE' });
    const vincular = new VincularDispositivoUseCase(e.cuentas, e.dispositivos, e.tokens, e.bus, e.generarId, e.reloj.ahora);
    await expect(vincular.ejecutar({ cuentaId: docente.id, nombre: 'PC' })).rejects.toThrow(ProhibidoError);
  });

  it('exportar reúne datos personales, consentimiento y lo que aportan otros módulos', async () => {
    const familia = await cuentaActiva(e);
    const c = await consentimientoParental(e, familia.id);
    const perfil = await perfilEstudiante(e, familia.id, { consentimientoId: c.id });
    const exportar = new ExportarDatosUseCase(e.perfiles, e.consentimientos, e.recolector, e.bus, e.reloj.ahora);

    const datos = await exportar.ejecutar({ cuentaId: familia.id, perfilId: perfil.id });
    expect(datos).toMatchObject({
      perfil: { alias: 'Lucía', rangoEdad: 'R2' },
      consentimiento: { tipo: 'PARENTAL', versionPolitica: '2026-09' },
      progreso: { lecturas: 3 },
    });
    expect(JSON.stringify(datos)).not.toContain('hash');
  });

  it('eliminar anonimiza, cierra sesiones y avisa a los demás módulos', async () => {
    const familia = await cuentaActiva(e);
    const perfil = await perfilEstudiante(e, familia.id);
    const eliminar = new SolicitarEliminacionUseCase(e.perfiles, e.sesiones, e.bus, e.reloj.ahora);

    await eliminar.ejecutar({ cuentaId: familia.id, perfilId: perfil.id });
    expect(perfil.alias).toBe('Perfil eliminado');
    expect(e.bus.nombres()).toContain(EVENTOS_IAM.PERFIL_ELIMINADO);
    await expect(eliminar.ejecutar({ cuentaId: familia.id, perfilId: perfil.id })).rejects.toThrow(NoEncontradoError);
  });
});
