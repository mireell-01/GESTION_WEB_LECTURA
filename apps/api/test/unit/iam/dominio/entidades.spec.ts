import { describe, expect, it } from 'vitest';

import { Consentimiento } from '../../../../src/modules/iam/domain/entities/consentimiento';
import { Cuenta } from '../../../../src/modules/iam/domain/entities/cuenta';
import { DispositivoFamiliar } from '../../../../src/modules/iam/domain/entities/dispositivo-familiar';
import {
  DURACION_BLOQUEO_MIN,
  MAX_INTENTOS_PIN,
  PerfilEstudiante,
} from '../../../../src/modules/iam/domain/entities/perfil-estudiante';
import { Sesion } from '../../../../src/modules/iam/domain/entities/sesion';
import { DatoInvalidoError } from '../../../../src/modules/iam/domain/errors/errores-iam';
import { PerfilBloqueadoError } from '../../../../src/modules/iam/domain/errors/perfil-bloqueado-error';
import { AnioMesNacimiento } from '../../../../src/modules/iam/domain/value-objects/anio-mes-nacimiento';
import { Contrasena } from '../../../../src/modules/iam/domain/value-objects/contrasena';
import { Email } from '../../../../src/modules/iam/domain/value-objects/email';
import { Rol } from '../../../../src/modules/iam/domain/value-objects/rol';

const T0 = new Date('2026-10-15T15:00:00Z');
const masMin = (min: number) => new Date(T0.getTime() + min * 60_000);

function perfil(alias = 'Lucía', avatar = 'zorro') {
  return PerfilEstudiante.crear({
    id: 'p1',
    cuentaResponsableId: 'c1',
    consentimientoId: 'k1',
    alias,
    anioMesNacimiento: AnioMesNacimiento.de(2018, 5, T0),
    avatar,
    hashPin: 'hash:2580',
    ahora: T0,
  });
}

describe('PerfilEstudiante — datos mínimos (RN-02)', () => {
  it('normaliza espacios del alias', () => {
    expect(perfil('  Ana   Lucía ').alias).toBe('Ana Lucía');
  });

  it.each(['A', 'un alias demasiado largo para un niño', 'ana@correo.pe', 'Ana 987654321'])(
    'rechaza el alias "%s"',
    (alias) => {
      expect(() => perfil(alias)).toThrow(DatoInvalidoError);
    },
  );

  it('solo admite avatares ilustrados de la lista', () => {
    expect(() => perfil('Lucía', 'foto-real.jpg')).toThrow(/avatares disponibles/);
  });
});

describe('PerfilEstudiante — bloqueo por PIN (RF-008, RN-03)', () => {
  it(`se bloquea ${DURACION_BLOQUEO_MIN} min al ${MAX_INTENTOS_PIN}.º PIN incorrecto`, () => {
    const p = perfil();
    for (let i = 1; i < MAX_INTENTOS_PIN; i++) p.registrarIntentoFallido(T0);
    expect(p.estaBloqueado(T0)).toBe(false);
    expect(p.intentosFallidos).toBe(MAX_INTENTOS_PIN - 1);

    p.registrarIntentoFallido(T0);
    expect(p.estaBloqueado(T0)).toBe(true);
    expect(p.estaBloqueado(masMin(DURACION_BLOQUEO_MIN - 0.01))).toBe(true);
    expect(p.estaBloqueado(masMin(DURACION_BLOQUEO_MIN))).toBe(false);
  });

  it('el sexto intento durante el bloqueo se rechaza con la hora de desbloqueo', () => {
    const p = perfil();
    for (let i = 0; i < MAX_INTENTOS_PIN; i++) p.registrarIntentoFallido(T0);
    try {
      p.asegurarNoBloqueado(masMin(1));
      expect.fail('debió lanzar PerfilBloqueadoError');
    } catch (error) {
      expect(error).toBeInstanceOf(PerfilBloqueadoError);
      expect((error as PerfilBloqueadoError).desbloqueaEn).toEqual(masMin(DURACION_BLOQUEO_MIN));
      expect((error as PerfilBloqueadoError).tipo).toBe('BLOQUEADO');
    }
  });

  it('un PIN correcto reinicia el contador de intentos', () => {
    const p = perfil();
    p.registrarIntentoFallido(T0);
    p.registrarIntentoFallido(T0);
    p.registrarIntentoCorrecto();
    expect(p.intentosFallidos).toBe(0);
  });

  it('restablecer el PIN desbloquea el perfil', () => {
    const p = perfil();
    for (let i = 0; i < MAX_INTENTOS_PIN; i++) p.registrarIntentoFallido(T0);
    p.restablecerPin('hash:3691');
    expect(p.estaBloqueado(T0)).toBe(false);
    expect(p.hashPin).toBe('hash:3691');
  });
});

describe('PerfilEstudiante — eliminación (RF-013)', () => {
  it('anonimizar borra datos personales y desactiva', () => {
    const p = perfil();
    p.anonimizar(T0);
    expect(p.alias).toBe('Perfil eliminado');
    expect(p.hashPin).toBe('');
    expect(p.activo).toBe(false);
    expect(p.propsSnapshot.eliminadoEn).toEqual(T0);
  });
});

describe('Sesion — inactividad (RF-010)', () => {
  const abrir = (rol: string) =>
    Sesion.abrir({ id: 's1', sujetoId: 'x', rol, mfa: false, hashRefreshToken: 'h', ahora: T0 });

  it('estudiante: viva a los 10 min, cerrada a los 10 min + 1 ms', () => {
    const s = abrir('ESTUDIANTE');
    expect(s.estaViva(masMin(10))).toBe(true);
    expect(s.estaViva(new Date(masMin(10).getTime() + 1))).toBe(false);
  });

  it('adulto: viva a los 30 min, cerrada después', () => {
    const s = abrir('DOCENTE');
    expect(s.estaViva(masMin(30))).toBe(true);
    expect(s.estaViva(masMin(31))).toBe(false);
  });

  it('la actividad reinicia la ventana y solo pide persistir cada minuto', () => {
    const s = abrir('ESTUDIANTE');
    expect(s.registrarActividad(masMin(0.5))).toBe(false);
    expect(s.registrarActividad(masMin(8))).toBe(true);
    expect(s.estaViva(masMin(17))).toBe(true);
  });

  it('una sesión revocada nunca está viva', () => {
    const s = abrir('FAMILIAR');
    s.revocar(T0);
    expect(s.estaViva(T0)).toBe(false);
  });

  it('rotar el refresh token cambia la huella (RF-003)', () => {
    const s = abrir('FAMILIAR');
    s.rotarRefreshToken('h2', masMin(5));
    expect(s.hashRefreshToken).toBe('h2');
  });
});

describe('Cuenta — ciclo de vida y MFA en dos pasos (RF-002, RF-011, RF-076)', () => {
  const nueva = (rol: Parameters<typeof Rol.de>[0] = 'EDITOR') =>
    Cuenta.registrar({
      id: 'c1',
      nombre: 'Rosa Demo',
      email: Email.de('rosa@lectoaventura.test'),
      contrasena: Contrasena.de('Lectura-Segura-2026'),
      rol: Rol.de(rol),
      hashContrasena: 'hash',
      ahora: T0,
    });

  it('nace pendiente y se activa al verificar', () => {
    const c = nueva();
    expect(c.estaActiva()).toBe(false);
    c.verificar();
    expect(c.estaActiva()).toBe(true);
  });

  it('suspender y reactivar', () => {
    const c = nueva();
    c.verificar();
    c.suspender();
    expect(c.estaSuspendida()).toBe(true);
    c.reactivar();
    expect(c.estaActiva()).toBe(true);
  });

  it('no permite registrar un estudiante con contraseña', () => {
    expect(() => nueva('ESTUDIANTE')).toThrow(/roles adultos/);
  });

  it('confirmar MFA sin haberlo iniciado falla; iniciado lo activa', () => {
    const c = nueva();
    expect(() => c.confirmarMfa()).toThrow(DatoInvalidoError);
    c.iniciarMfa('SECRETO');
    c.confirmarMfa();
    expect(c.mfaHabilitado).toBe(true);
    expect(c.mfaSecret).toBe('SECRETO');
    expect(c.mfaSecretPendiente).toBeNull();
  });
});

describe('Consentimiento y DispositivoFamiliar', () => {
  it('el consentimiento institucional exige aula (RN-01)', () => {
    expect(() =>
      Consentimiento.otorgar({
        id: 'k1', cuentaResponsableId: 'c1', tipo: 'INSTITUCIONAL', versionPolitica: '2026-09',
        otorganteNombre: 'Directora Ruiz', medio: 'FISICO', ahora: T0,
      }),
    ).toThrow(/indicar el aula/);
  });

  it('el dispositivo vence a los 30 días o al revocarse (RN-04)', () => {
    const d = DispositivoFamiliar.vincular({ id: 'd1', cuentaId: 'c1', nombre: 'Tablet', hashToken: 'h', ahora: T0 });
    expect(d.estaVigente(masMin(30 * 24 * 60 - 1))).toBe(true);
    expect(d.estaVigente(masMin(30 * 24 * 60))).toBe(false);
    d.revocar(T0);
    expect(d.estaVigente(T0)).toBe(false);
  });
});
