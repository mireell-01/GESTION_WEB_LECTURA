import { describe, expect, it } from 'vitest';

import { Asignacion, MAX_DIAS_ASIGNACION } from '../../../../src/modules/escuela/domain/entities/asignacion';
import { Aula, MAX_MATRICULAS_ACTIVAS } from '../../../../src/modules/escuela/domain/entities/aula';
import { InvitacionFamiliar, VIGENCIA_INVITACION_DIAS } from '../../../../src/modules/escuela/domain/entities/invitacion-familiar';
import { Matricula } from '../../../../src/modules/escuela/domain/entities/matricula';
import {
  AulaArchivadaError,
  AulaLlenaError,
  DatoAsignacionInvalidoError,
  DatoAulaInvalidoError,
  EstudianteRepetidoEnAulaError,
  InvitacionInvalidaError,
} from '../../../../src/modules/escuela/domain/errors/errores-escuela';
import { generarPinTarjeta, PoliticaMatricula } from '../../../../src/modules/escuela/domain/services/politica-matricula';
import { ALFABETO_CODIGO_AULA, CodigoAula } from '../../../../src/modules/escuela/domain/value-objects/codigo-aula';
import { CodigoInvitacion } from '../../../../src/modules/escuela/domain/value-objects/codigo-invitacion';
import { FechaLima } from '../../../../src/modules/escuela/domain/value-objects/fecha-lima';

/** Nivel 1 — Dominio de Escuela (RF-014 a RF-020): reglas puras, sin base de datos. */
const AHORA = new Date('2026-10-15T15:00:00Z'); // jueves, 10:00 en Lima

describe('Aula (RF-014, RF-020)', () => {
  const crear = (cambios: Partial<Parameters<typeof Aula.crear>[0]> = {}) =>
    Aula.crear({
      id: 'aula-1', docenteId: 'doc-1', nombre: ' 3.° B ', grado: '3', anioLectivo: 2026, institucion: 'IE 1234',
      codigo: CodigoAula.desdePersistencia('ABC234'), ahora: AHORA, ...cambios,
    });

  it('se crea activa, recorta el nombre y pertenece a su docente', () => {
    const aula = crear();
    expect(aula.nombre).toBe('3.° B');
    expect(aula.estaActiva).toBe(true);
    expect(aula.perteneceA('doc-1')).toBe(true);
    expect(aula.perteneceA('doc-2')).toBe(false);
  });

  it.each([
    [{ nombre: 'B' }, /nombre/],
    [{ grado: '7' }, /grado/],
    [{ anioLectivo: 2030 }, /año lectivo/],
    [{ institucion: 'IE' }, /institución/],
  ])('rechaza datos inválidos %o', (cambio, mensaje) => {
    expect(() => crear(cambio)).toThrow(DatoAulaInvalidoError);
    expect(() => crear(cambio)).toThrow(mensaje);
  });

  it('al archivarse queda en solo lectura y no se archiva dos veces', () => {
    const aula = crear();
    aula.archivar(AHORA);
    expect(aula.estaActiva).toBe(false);
    expect(aula.propsSnapshot.archivadaEn).toEqual(AHORA);
    expect(() => aula.asegurarEditable()).toThrow(AulaArchivadaError);
    expect(() => aula.archivar(AHORA)).toThrow(AulaArchivadaError);
  });

  it('el código de aula tiene 6 caracteres sin ambiguos (0/O, 1/I/L)', () => {
    let i = 0;
    const codigo = CodigoAula.generar((n) => (i++ * 7) % n).value;
    expect(codigo).toHaveLength(6);
    expect([...codigo].every((c) => ALFABETO_CODIGO_AULA.includes(c))).toBe(true);
    expect(ALFABETO_CODIGO_AULA).not.toMatch(/[01OIL]/);
  });
});

describe('Matrícula y política de matrícula (RF-015, RF-016)', () => {
  it('retirar conserva la fecha y es idempotente', () => {
    const m = Matricula.crear({ id: 'm-1', aulaId: 'a', estudianteId: 'e', ahora: AHORA });
    m.retirar(AHORA);
    m.retirar(new Date('2027-01-01'));
    expect(m.activa).toBe(false);
    expect(m.propsSnapshot.retiradaEn).toEqual(AHORA);
  });

  it(`un aula admite hasta ${MAX_MATRICULAS_ACTIVAS} estudiantes activos`, () => {
    expect(() => PoliticaMatricula.validarCapacidad(44, 1)).not.toThrow();
    expect(() => PoliticaMatricula.validarCapacidad(44, 2)).toThrow(AulaLlenaError);
  });

  it('alias + avatar deben distinguirse en el aula (sin importar mayúsculas)', () => {
    const existentes = [{ alias: 'Mateo', avatar: 'leon' }];
    expect(() => PoliticaMatricula.validarDistinguible(existentes, { alias: ' mateo ', avatar: 'leon' })).toThrow(EstudianteRepetidoEnAulaError);
    expect(() => PoliticaMatricula.validarDistinguible(existentes, { alias: 'Mateo', avatar: 'zorro' })).not.toThrow();
  });

  it('el PIN de la tarjeta evita repetidos, escaleras y años', () => {
    // La fuente entrega primero PIN fáciles (1111, 1234, 2017) y luego uno válido.
    const cola = [1, 1, 1, 1, 1, 2, 3, 4, 2, 0, 1, 7, 4, 8, 2, 6];
    expect(generarPinTarjeta(() => cola.shift() as number, 2017)).toBe('4826');
    // También rechaza el año de nacimiento aunque no parezca un año reciente.
    const conAnio = [1, 9, 8, 6, 5, 7, 3, 9];
    expect(generarPinTarjeta(() => conAnio.shift() as number, 1986)).toBe('5739');
  });
});

describe('FechaLima: días del calendario escolar en hora de Lima', () => {
  it('un día va de 00:00 a 23:59:59.999 en Lima (UTC−5)', () => {
    const dia = FechaLima.de('2026-10-20');
    expect(dia.inicio.toISOString()).toBe('2026-10-20T05:00:00.000Z');
    expect(dia.fin.toISOString()).toBe('2026-10-21T04:59:59.999Z');
  });

  it('"hoy" es el día de Lima aunque en UTC ya sea mañana', () => {
    expect(FechaLima.hoy(new Date('2026-10-16T04:30:00Z')).value).toBe('2026-10-15');
    expect(FechaLima.hoy(new Date('2026-10-16T05:00:00Z')).value).toBe('2026-10-16');
  });

  it('suma días y compara', () => {
    const hoy = FechaLima.hoy(AHORA);
    expect(hoy.sumarDias(17).value).toBe('2026-11-01');
    expect(hoy.esAnteriorA(hoy.sumarDias(1))).toBe(true);
    expect(hoy.esAnteriorA(hoy)).toBe(false);
  });

  it.each(['2026-02-30', '20-10-2026', '2026/10/20', ''])('rechaza fechas inválidas: "%s"', (texto) => {
    expect(() => FechaLima.de(texto)).toThrow(DatoAsignacionInvalidoError);
  });
});

describe('Asignación (RF-018): PROGRAMADA → ACTIVA → VENCIDA → CERRADA', () => {
  const crear = (desde: string, hasta: string, estudianteIds: string[] = []) =>
    Asignacion.crear({
      id: 'asig-1', aulaId: 'aula-1', docenteId: 'doc-1', tipo: 'LECTURA', contenidoId: 'lectura-1',
      titulo: ' El zorro y la luna ', estudianteIds, desde: FechaLima.de(desde), hasta: FechaLima.de(hasta), ahora: AHORA,
    });

  it('si empieza hoy nace ACTIVA; si empieza después, PROGRAMADA', () => {
    expect(crear('2026-10-15', '2026-10-15').estado).toBe('ACTIVA');
    const futura = crear('2026-10-19', '2026-10-23');
    expect(futura.estado).toBe('PROGRAMADA');
    expect(futura.propsSnapshot.titulo).toBe('El zorro y la luna');
  });

  it('el tiempo la lleva de PROGRAMADA a ACTIVA y a VENCIDA (al terminar el día límite en Lima)', () => {
    const a = crear('2026-10-19', '2026-10-23');
    expect(a.estadoEn(new Date('2026-10-19T04:59:59Z'))).toBe('PROGRAMADA');
    expect(a.estadoEn(new Date('2026-10-19T05:00:00Z'))).toBe('ACTIVA');
    expect(a.estadoEn(new Date('2026-10-24T04:59:59Z'))).toBe('ACTIVA');
    expect(a.estadoEn(new Date('2026-10-24T05:00:00Z'))).toBe('VENCIDA');

    expect(a.actualizarEstado(new Date('2026-10-20T15:00:00Z'))).toBe(true);
    expect(a.estado).toBe('ACTIVA');
    expect(a.actualizarEstado(new Date('2026-10-20T16:00:00Z'))).toBe(false);
  });

  it('cerrada queda cerrada aunque siga dentro de fechas', () => {
    const a = crear('2026-10-15', '2026-10-30');
    a.cerrar();
    expect(a.estadoEn(new Date('2026-10-20T15:00:00Z'))).toBe('CERRADA');
    expect(a.estaAbierta(AHORA)).toBe(false);
  });

  it('es para toda el aula o solo para los estudiantes elegidos (sin repetir)', () => {
    expect(crear('2026-10-15', '2026-10-20').esPara('cualquiera')).toBe(true);
    const elegidos = crear('2026-10-15', '2026-10-20', ['e1', 'e2', 'e1']);
    expect(elegidos.paraTodaElAula).toBe(false);
    expect(elegidos.estudianteIds).toEqual(['e1', 'e2']);
    expect(elegidos.esPara('e2')).toBe(true);
    expect(elegidos.esPara('e3')).toBe(false);
  });

  it.each([
    ['2026-10-14', '2026-10-20', /anterior a hoy/],
    ['2026-10-20', '2026-10-19', /igual o posterior/],
    ['2026-10-15', FechaLima.hoy(AHORA).sumarDias(MAX_DIAS_ASIGNACION + 1).value, /6 meses/],
  ])('rechaza fechas imposibles: %s → %s', (desde, hasta, mensaje) => {
    expect(() => crear(desde, hasta)).toThrow(mensaje);
  });

  it('necesita el título de su contenido', () => {
    expect(() =>
      Asignacion.crear({
        id: 'x', aulaId: 'a', docenteId: 'd', tipo: 'MISION', contenidoId: 'm', titulo: '  ', estudianteIds: [],
        desde: FechaLima.de('2026-10-15'), hasta: FechaLima.de('2026-10-16'), ahora: AHORA,
      }),
    ).toThrow(DatoAsignacionInvalidoError);
  });
});

describe('Invitación familiar (RF-019): código de un solo uso por 7 días', () => {
  it('el código tiene 8 caracteres sin ambiguos y se lee como ABCD-2345', () => {
    let i = 0;
    const codigo = CodigoInvitacion.generar((n) => i++ % n);
    expect(codigo.value).toBe('ABCDEFGH');
    expect(codigo.legible).toBe('ABCD-EFGH');
  });

  it('acepta lo que escribe la familia con guion, espacios o minúsculas', () => {
    expect(CodigoInvitacion.intentar(' abcd-efgh ')?.value).toBe('ABCDEFGH');
    expect(CodigoInvitacion.intentar('ABCD EFGH')?.value).toBe('ABCDEFGH');
    expect(CodigoInvitacion.intentar('ABCD-EFG')).toBeNull();
    expect(CodigoInvitacion.intentar('ABCD-EFG0')).toBeNull(); // 0 es ambiguo: no existe en el alfabeto
  });

  const emitir = () =>
    InvitacionFamiliar.emitir({ id: 'inv-1', aulaId: 'a', estudianteId: 'e', docenteId: 'd', hashCodigo: 'h', ahora: AHORA });

  it(`vence a los ${VIGENCIA_INVITACION_DIAS} días`, () => {
    const inv = emitir();
    expect(inv.expiraEn.toISOString()).toBe('2026-10-22T15:00:00.000Z');
    expect(inv.estaVigente(new Date('2026-10-22T14:59:59Z'))).toBe(true);
    expect(inv.estaVigente(new Date('2026-10-22T15:00:00Z'))).toBe(false);
    expect(() => inv.canjear('fam-1', new Date('2026-10-23T00:00:00Z'))).toThrow(InvitacionInvalidaError);
  });

  it('se usa una sola vez y registra quién la canjeó', () => {
    const inv = emitir();
    inv.canjear('fam-1', AHORA);
    expect(inv.propsSnapshot).toMatchObject({ usadaEn: AHORA, cuentaFamiliarId: 'fam-1' });
    expect(inv.estaVigente(AHORA)).toBe(false);
    expect(() => inv.canjear('fam-2', AHORA)).toThrow(InvitacionInvalidaError);
  });
});
