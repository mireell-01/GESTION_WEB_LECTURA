import { beforeEach, describe, expect, it } from 'vitest';

import { ActualizarPerfilUseCase } from '../../../../src/modules/iam/application/use-cases/actualizar-perfil.use-case';
import {
  CrearPerfilEstudianteUseCase,
  MAX_PERFILES_FAMILIA,
} from '../../../../src/modules/iam/application/use-cases/crear-perfil-estudiante.use-case';
import { ContextoIngresoUseCase } from '../../../../src/modules/iam/application/use-cases/contexto-ingreso.use-case';
import { DescargarExportacionUseCase } from '../../../../src/modules/iam/application/use-cases/descargar-exportacion.use-case';
import { SolicitarExportacionUseCase } from '../../../../src/modules/iam/application/use-cases/solicitar-exportacion.use-case';
import { RecuperarContrasenaUseCase } from '../../../../src/modules/iam/application/use-cases/recuperar-contrasena.use-case';
import { ReenviarVerificacionUseCase } from '../../../../src/modules/iam/application/use-cases/reenviar-verificacion.use-case';
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

  it('el enlace activa la cuenta una sola vez; volver a abrirlo avisa que ya estaba verificada', async () => {
    const { cuentaId } = await registrar.ejecutar(datos);
    const codigo = codigoDelEnlace(e.correo.enviados[0]?.enlace);

    expect(await verificar.ejecutar(codigo)).toEqual({ ok: true, estado: 'VERIFICADA' });
    expect((await e.cuentas.buscarPorId(cuentaId))?.estaActiva()).toBe(true);
    expect(e.bus.nombres()).toContain(EVENTOS_IAM.CUENTA_VERIFICADA);
    expect(await verificar.ejecutar(codigo)).toEqual({ ok: true, estado: 'YA_VERIFICADA' });
    expect(e.bus.nombres().filter((n) => n === EVENTOS_IAM.CUENTA_VERIFICADA)).toHaveLength(1);
  });

  it('explica por qué no sirve un enlace: vencido a las 24 h o inexistente', async () => {
    await registrar.ejecutar(datos);
    const codigo = codigoDelEnlace(e.correo.enviados[0]?.enlace);
    e.reloj.avanzarMin(24 * 60 + 1);

    const vencido = await verificar.ejecutar(codigo).catch((err) => err);
    expect(vencido).toBeInstanceOf(EnlaceInvalidoError);
    expect(vencido.detalle).toEqual({ motivo: 'VENCIDO' });
    expect(vencido.message).toMatch(/venció/);
    const inexistente = await verificar.ejecutar('codigo-que-no-existe').catch((err) => err);
    expect(inexistente.detalle).toEqual({ motivo: 'INVALIDO' });
  });
});

describe('Reenvío del enlace de verificación (RF-002, RNF-019)', () => {
  let e: Entorno;
  let registrar: RegistrarCuentaUseCase;
  let reenviar: ReenviarVerificacionUseCase;
  let verificar: VerificarCorreoUseCase;
  const datos = { nombre: 'Rosa Demo', email: 'rosa@lectoaventura.test', contrasena: 'Lectura-Segura-2026', rol: 'FAMILIAR' as const };
  const RESPUESTA = { ok: true, reintentarEnSeg: 60 };

  beforeEach(() => {
    e = crearEntorno();
    registrar = new RegistrarCuentaUseCase(
      e.cuentas, e.verificaciones, e.hash, e.filtradas, e.tokens, e.correo, e.bus, URL_WEB, e.generarId, e.reloj.ahora,
    );
    reenviar = new ReenviarVerificacionUseCase(e.cuentas, e.verificaciones, e.tokens, e.correo, e.bus, URL_WEB, e.generarId, e.reloj.ahora);
    verificar = new VerificarCorreoUseCase(e.cuentas, e.verificaciones, e.tokens, e.bus, e.reloj.ahora);
  });

  it('envía un enlace nuevo de un solo uso y deja sin efecto el anterior', async () => {
    const { cuentaId } = await registrar.ejecutar(datos);
    const anterior = codigoDelEnlace(e.correo.enviados[0]?.enlace);
    e.reloj.avanzarMin(2);

    expect(await reenviar.ejecutar(' Rosa@LectoAventura.test ')).toEqual(RESPUESTA);
    expect(e.correo.enviados).toHaveLength(2);
    expect(e.correo.enviados[1]).toMatchObject({ para: 'rosa@lectoaventura.test', asunto: 'Confirma tu correo en LectoAventura' });
    expect(e.correo.enviados[1]?.texto).toMatch(/24 horas y solo funciona una vez/);
    expect(e.bus.nombres()).toContain(EVENTOS_IAM.VERIFICACION_REENVIADA);

    // El enlace anterior ya no sirve y lo dice; el nuevo activa la cuenta.
    const reemplazado = await verificar.ejecutar(anterior).catch((err) => err);
    expect(reemplazado).toBeInstanceOf(EnlaceInvalidoError);
    expect(reemplazado.detalle).toEqual({ motivo: 'REEMPLAZADO' });
    expect(await verificar.ejecutar(codigoDelEnlace(e.correo.enviados[1]?.enlace))).toEqual({ ok: true, estado: 'VERIFICADA' });
    expect((await e.cuentas.buscarPorId(cuentaId))?.estaActiva()).toBe(true);
  });

  it('sirve aunque el primer enlace ya haya vencido', async () => {
    await registrar.ejecutar(datos);
    e.reloj.avanzarMin(25 * 60);
    await reenviar.ejecutar(datos.email);
    expect(await verificar.ejecutar(codigoDelEnlace(e.correo.enviados[1]?.enlace))).toEqual({ ok: true, estado: 'VERIFICADA' });
  });

  it('respeta 60 s de espera entre enlaces y un máximo de 5 por hora', async () => {
    await registrar.ejecutar(datos);
    // Recién registrada: debe esperar 60 s.
    await reenviar.ejecutar(datos.email);
    expect(e.correo.enviados).toHaveLength(1);

    for (let i = 0; i < 6; i++) {
      e.reloj.avanzarMin(1.5);
      expect(await reenviar.ejecutar(datos.email)).toEqual(RESPUESTA);
    }
    // 1 del registro + 4 reenvíos = 5 en la última hora; el resto no se envía.
    expect(e.correo.enviados).toHaveLength(5);
    e.reloj.avanzarMin(60);
    await reenviar.ejecutar(datos.email);
    expect(e.correo.enviados).toHaveLength(6);
  });

  it('a una cuenta ya verificada le avisa por correo que puede ingresar, sin enlace de verificación', async () => {
    await cuentaActiva(e, { email: 'ana@lectoaventura.test' });
    expect(await reenviar.ejecutar('ana@lectoaventura.test')).toEqual(RESPUESTA);
    expect(e.correo.enviados[0]).toMatchObject({ asunto: 'Tu correo ya está verificado en LectoAventura', enlace: `${URL_WEB}/ingresar` });
    expect(e.verificaciones.filas.size).toBe(0);
  });

  it('responde igual si la cuenta no existe o está suspendida, sin enviar nada (anti-enumeración)', async () => {
    const suspendida = await cuentaActiva(e, { email: 'suspendida@lectoaventura.test' });
    suspendida.suspender();
    expect(await reenviar.ejecutar('nadie@lectoaventura.test')).toEqual(RESPUESTA);
    expect(await reenviar.ejecutar('suspendida@lectoaventura.test')).toEqual(RESPUESTA);
    expect(e.correo.enviados).toHaveLength(0);
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
    const vincular = new VincularDispositivoUseCase(e.cuentas, e.dispositivos, e.contextoAula, e.tokens, e.bus, e.generarId, e.reloj.ahora);
    const contexto = new ContextoIngresoUseCase(e.perfiles, e.dispositivos, e.contextoAula, e.tokens, e.reloj.ahora);
    const { tokenDispositivo, contexto: activado } = await vincular.ejecutar({ cuentaId: familia.id, nombre: 'Tablet' });
    const alumnos = async () => (await contexto.deDispositivo(tokenDispositivo)).estudiantes;

    expect(activado).toEqual({ tipo: 'FAMILIA', nombre: 'Tu familia' });
    expect(await alumnos()).toHaveLength(1);
    await actualizar.ejecutar({ cuentaId: familia.id, perfilId: perfil.id, activo: false });
    expect(await alumnos()).toHaveLength(0);
    await actualizar.ejecutar({ cuentaId: familia.id, perfilId: perfil.id, activo: true, avatar: 'panda' });
    expect(await alumnos()).toEqual([{ id: perfil.id, alias: 'Lucía', avatar: 'panda' }]);
    // RN-04: el vínculo vence a los 30 días.
    e.reloj.avanzarMin(30 * 24 * 60);
    await expect(contexto.deDispositivo(tokenDispositivo)).rejects.toThrow(ProhibidoError);
  });

  describe('Activar la tablet (RN-04, CR-01)', () => {
    const crearCaso = () =>
      new VincularDispositivoUseCase(e.cuentas, e.dispositivos, e.contextoAula, e.tokens, e.bus, e.generarId, e.reloj.ahora);

    it('la docente activa la tablet de su aula: guarda solo la huella del token y publica el evento', async () => {
      const docente = await cuentaActiva(e, { rol: 'DOCENTE' });
      e.contextoAula.agregarAula('aula-1', { docenteId: docente.id, nombre: '2.° A' });

      const r = await crearCaso().ejecutar({ cuentaId: docente.id, nombre: 'Tablet 3', aulaId: 'aula-1' });

      expect(r.contexto).toEqual({ tipo: 'AULA', nombre: '2.° A' });
      const [guardado] = [...e.dispositivos.filas.values()];
      expect(guardado.contexto).toEqual({ tipo: 'AULA', aulaId: 'aula-1' });
      expect(guardado.propsSnapshot.hashToken).toBe(e.tokens.huella(r.tokenDispositivo));
      expect(guardado.propsSnapshot.hashToken).not.toBe(r.tokenDispositivo);
      expect(e.bus.publicados.at(-1)).toMatchObject({
        nombreEvento: EVENTOS_IAM.DISPOSITIVO_VINCULADO,
        datos: { actorId: docente.id, tipo: 'AULA', aulaId: 'aula-1' },
      });
    });

    it('no deja activar el aula de otra docente, un aula archivada ni un aula inexistente', async () => {
      const docente = await cuentaActiva(e, { rol: 'DOCENTE' });
      const otra = await cuentaActiva(e, { rol: 'DOCENTE' });
      e.contextoAula.agregarAula('ajena', { docenteId: otra.id });
      e.contextoAula.agregarAula('vieja', { docenteId: docente.id, activa: false });

      for (const aulaId of ['ajena', 'vieja', 'no-existe']) {
        await expect(crearCaso().ejecutar({ cuentaId: docente.id, nombre: 'Tablet', aulaId })).rejects.toThrow(
          /No encontramos esa aula/,
        );
      }
      expect(e.dispositivos.filas.size).toBe(0);
    });

    it('la familia no activa aulas y la docente debe elegir un aula', async () => {
      const familia = await cuentaActiva(e);
      const docente = await cuentaActiva(e, { rol: 'DOCENTE' });
      e.contextoAula.agregarAula('aula-1', { docenteId: familia.id });

      await expect(crearCaso().ejecutar({ cuentaId: familia.id, nombre: 'PC', aulaId: 'aula-1' })).rejects.toThrow(/No encontramos/);
      await expect(crearCaso().ejecutar({ cuentaId: docente.id, nombre: 'PC' })).rejects.toThrow(/Elige el aula/);
    });

    it('una cuenta inexistente o suspendida no activa dispositivos', async () => {
      await expect(crearCaso().ejecutar({ cuentaId: 'nadie', nombre: 'PC' })).rejects.toThrow(ProhibidoError);
      const familia = await cuentaActiva(e);
      familia.suspender();
      await expect(crearCaso().ejecutar({ cuentaId: familia.id, nombre: 'PC' })).rejects.toThrow(ProhibidoError);
    });
  });

  describe('Exportación de datos (RF-012)', () => {
    async function preparar() {
      const familia = await cuentaActiva(e);
      const c = await consentimientoParental(e, familia.id);
      const perfil = await perfilEstudiante(e, familia.id, { consentimientoId: c.id });
      const solicitar = new SolicitarExportacionUseCase(
        e.perfiles, e.consentimientos, e.recolector, e.exportaciones, e.pdf, e.firmador, e.bus, e.generarId, e.reloj.ahora,
      );
      const descargar = new DescargarExportacionUseCase(e.exportaciones, e.firmador, e.reloj.ahora);
      return { familia, perfil, solicitar, descargar };
    }

    /** Separa id, formato, expira y firma de un enlace firmado. */
    function partes(enlace: string) {
      const url = new URL(enlace, 'http://localhost');
      const [, , , , id = '', formato = ''] = url.pathname.split('/');
      return { id, formato, expira: url.searchParams.get('expira') ?? '', firma: url.searchParams.get('firma') ?? '' };
    }

    it('genera JSON y PDF con datos personales, consentimiento y lo que aportan otros módulos', async () => {
      const { familia, perfil, solicitar, descargar } = await preparar();
      const r = await solicitar.ejecutar({ cuentaId: familia.id, perfilId: perfil.id });

      expect(new Date(r.expiraEn).getTime() - e.reloj.ahora().getTime()).toBe(72 * 3_600_000);
      expect(r.enlaces.json).toMatch(/^\/api\/v1\/exportaciones\/.+\/json\?expira=\d+&firma=/);

      const json = await descargar.ejecutar(partes(r.enlaces.json));
      const datos = JSON.parse(json.contenido.toString('utf8'));
      expect(json.tipoMime).toMatch(/application\/json/);
      expect(datos).toMatchObject({
        perfil: { alias: 'Lucía', rangoEdad: 'R2' },
        consentimiento: { tipo: 'PARENTAL', versionPolitica: '2026-09' },
        progreso: { lecturas: 3 },
      });
      expect(JSON.stringify(datos)).not.toMatch(/hash|bloqueadoHasta/);

      const pdf = await descargar.ejecutar(partes(r.enlaces.pdf));
      expect(pdf.tipoMime).toBe('application/pdf');
      expect(e.pdf.recibidos[0]).toEqual(datos);
      expect(e.bus.nombres()).toContain(EVENTOS_IAM.DATOS_EXPORTADOS);
    });

    it('rechaza enlaces alterados: otra firma, otro formato u otra fecha de vencimiento', async () => {
      const { familia, perfil, solicitar, descargar } = await preparar();
      const r = await solicitar.ejecutar({ cuentaId: familia.id, perfilId: perfil.id });
      const json = partes(r.enlaces.json);

      await expect(descargar.ejecutar({ ...json, firma: 'firma-falsa' })).rejects.toThrow(/no es válido/);
      await expect(descargar.ejecutar({ ...json, formato: 'pdf' })).rejects.toThrow(/no es válido/);
      await expect(descargar.ejecutar({ ...json, expira: String(Number(json.expira) + 86_400_000) })).rejects.toThrow(/no es válido/);
      await expect(descargar.ejecutar({ ...json, formato: 'exe' })).rejects.toThrow(/no es válido/);
    });

    it('el enlace vence a las 72 h y la exportación vencida se borra en la siguiente solicitud', async () => {
      const { familia, perfil, solicitar, descargar } = await preparar();
      const r = await solicitar.ejecutar({ cuentaId: familia.id, perfilId: perfil.id });

      e.reloj.avanzarMin(72 * 60);
      await expect(descargar.ejecutar(partes(r.enlaces.pdf))).resolves.toMatchObject({ tipoMime: 'application/pdf' });
      e.reloj.avanzarMin(1);
      await expect(descargar.ejecutar(partes(r.enlaces.pdf))).rejects.toThrow(/venció/);

      await solicitar.ejecutar({ cuentaId: familia.id, perfilId: perfil.id });
      expect(await e.exportaciones.buscar(r.id)).toBeNull();
    });

    it('otra familia no puede exportar el perfil (RN-17)', async () => {
      const { perfil, solicitar } = await preparar();
      const intrusa = await cuentaActiva(e);
      await expect(solicitar.ejecutar({ cuentaId: intrusa.id, perfilId: perfil.id })).rejects.toThrow(NoEncontradoError);
    });
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
