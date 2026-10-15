import { describe, expect, it } from 'vitest';

import { PinInvalidoError } from '../../../../src/modules/iam/domain/errors/pin-invalido-error';
import { ContrasenaInvalidaError } from '../../../../src/modules/iam/domain/errors/contrasena-invalida-error';
import { EmailInvalidoError } from '../../../../src/modules/iam/domain/errors/email-invalido-error';
import { DatoInvalidoError } from '../../../../src/modules/iam/domain/errors/errores-iam';
import { AnioMesNacimiento } from '../../../../src/modules/iam/domain/value-objects/anio-mes-nacimiento';
import { CodigoUnUso } from '../../../../src/modules/iam/domain/value-objects/codigo-un-uso';
import { Contrasena } from '../../../../src/modules/iam/domain/value-objects/contrasena';
import { Email } from '../../../../src/modules/iam/domain/value-objects/email';
import { Pin } from '../../../../src/modules/iam/domain/value-objects/pin';
import { Rol } from '../../../../src/modules/iam/domain/value-objects/rol';

const HOY = new Date('2026-10-15T12:00:00Z');

describe('Pin (SRS §6 VO Pin, R-10)', () => {
  it('acepta 4 dígitos no triviales', () => {
    expect(Pin.de('2580').value).toBe('2580');
  });

  it.each(['123', '12345', 'abcd', '12a4', ''])('rechaza "%s" por formato', (valor) => {
    expect(() => Pin.de(valor)).toThrow(PinInvalidoError);
  });

  it.each(['0000', '1111', '5555', '9999', '1234', '4321'])('rechaza el PIN trivial %s', (valor) => {
    expect(() => Pin.de(valor)).toThrow(/fácil de adivinar/);
  });

  it('rechaza el año de nacimiento del perfil como PIN', () => {
    expect(() => Pin.de('2018', 2018)).toThrow(PinInvalidoError);
    expect(Pin.de('2018', 2017).value).toBe('2018');
  });
});

describe('AnioMesNacimiento (edad 5–13, RangoEdad R1/R2/R3)', () => {
  it.each([
    [2020, 10, 'R1'], // 6 años
    [2019, 1, 'R1'], // 7 años
    [2018, 5, 'R2'], // 8 años
    [2017, 3, 'R2'], // 9 años
    [2015, 6, 'R3'], // 11 años
  ] as const)('%i-%i → %s', (anio, mes, rango) => {
    expect(AnioMesNacimiento.de(anio, mes, HOY).rangoEdad(HOY)).toBe(rango);
  });

  it('acepta los límites 5 y 13 años', () => {
    expect(AnioMesNacimiento.de(2021, 10, HOY).edad(HOY)).toBe(5);
    expect(AnioMesNacimiento.de(2013, 10, HOY).edad(HOY)).toBe(13);
  });

  it('rechaza menores de 5 y mayores de 13 años (borde exacto por mes)', () => {
    expect(() => AnioMesNacimiento.de(2021, 11, HOY)).toThrow(DatoInvalidoError); // cumple 5 el próximo mes
    expect(() => AnioMesNacimiento.de(2012, 10, HOY)).toThrow(DatoInvalidoError); // 14 años
  });

  it.each([0, 13, 1.5])('rechaza el mes %s', (mes) => {
    expect(() => AnioMesNacimiento.de(2018, mes, HOY)).toThrow(/mes de nacimiento/);
  });
});

describe('Email y Contrasena', () => {
  it('normaliza el correo a minúsculas y sin espacios', () => {
    expect(Email.de('  Ana.Rios@Colegio.EDU.pe ').value).toBe('ana.rios@colegio.edu.pe');
  });

  it.each(['ana', 'ana@', '@colegio.pe', 'ana@colegio', 'ana rios@colegio.pe'])('rechaza "%s"', (valor) => {
    expect(() => Email.de(valor)).toThrow(EmailInvalidoError);
  });

  it('exige contraseña de al menos 10 caracteres (RF-001)', () => {
    expect(() => Contrasena.de('corta-123')).toThrow(ContrasenaInvalidaError);
    expect(Contrasena.de('exactamente10'.slice(0, 10)).value).toHaveLength(10);
  });
});

describe('Rol', () => {
  it('solo EDITOR, REVISOR y ADMIN_PLATAFORMA exigen MFA (RF-011)', () => {
    expect(Rol.de('EDITOR').requiereMfaObligatorio()).toBe(true);
    expect(Rol.de('REVISOR').requiereMfaObligatorio()).toBe(true);
    expect(Rol.de('ADMIN_PLATAFORMA').requiereMfaObligatorio()).toBe(true);
    expect(Rol.de('DOCENTE').requiereMfaObligatorio()).toBe(false);
    expect(Rol.de('FAMILIAR').requiereMfaObligatorio()).toBe(false);
  });

  it('el estudiante no es un rol adulto', () => {
    expect(Rol.de('ESTUDIANTE').esAdulto()).toBe(false);
  });
});

describe('CodigoUnUso (enlaces de RF-002 y RF-004)', () => {
  const expira = new Date('2026-10-15T12:30:00Z');

  it('se canjea una sola vez', () => {
    const codigo = CodigoUnUso.crear('abc', expira);
    expect(codigo.canjear(HOY)).toBe(true);
    expect(codigo.canjear(HOY)).toBe(false);
    expect(codigo.estaVigente(HOY)).toBe(false);
  });

  it('no se canjea vencido (borde: un milisegundo después)', () => {
    const codigo = CodigoUnUso.crear('abc', expira);
    expect(codigo.canjear(new Date(expira.getTime() + 1))).toBe(false);
    expect(CodigoUnUso.crear('abc', expira).canjear(expira)).toBe(true);
  });
});
