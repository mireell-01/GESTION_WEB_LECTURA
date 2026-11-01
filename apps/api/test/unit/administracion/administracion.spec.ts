import { beforeEach, describe, expect, it } from 'vitest';

import { Auditoria } from '../../../src/modules/administracion/domain/entities/auditoria';
import { ACCIONES_AUDITADAS, etiquetaAccion } from '../../../src/modules/administracion/domain/services/acciones-auditadas';
import { cursorDe, filtroAuditoria, inicioRetencion, POR_PAGINA } from '../../../src/modules/administracion/domain/services/consulta-auditoria';
import { crearEntornoAdministracion, EntornoAdministracion } from './dobles';

/** Nivel 1 — Administración de la plataforma (RF-076 a RF-078) con dobles. */
const ADMIN = '0192f000-0000-7000-8000-00000000a001';

describe('Auditoría: dominio (RF-077)', () => {
  it('cada acción auditada tiene su nombre para la administración', () => {
    expect(etiquetaAccion('PIN_RESTABLECIDO')).toBe('PIN restablecido');
    expect(etiquetaAccion('ACCION_ANTIGUA')).toBe('ACCION_ANTIGUA');
    expect(Object.keys(ACCIONES_AUDITADAS)).toEqual(expect.arrayContaining(['CONSENTIMIENTO_OTORGADO', 'DATOS_EXPORTADOS', 'PERFIL_ELIMINADO', 'LECTURA_PUBLICADA', 'CUENTA_SUSPENDIDA', 'DETALLE_ESTUDIANTE_CONSULTADO']));
  });

  it('se conserva 2 años', () => {
    expect(inicioRetencion(new Date('2026-10-30T15:00:00Z'))).toEqual(new Date('2024-10-30T15:00:00Z'));
  });

  it('valida los filtros: fechas de Lima (el día "hasta" completo), acción conocida, actor y página', () => {
    expect(filtroAuditoria({ desde: '2026-10-01', hasta: '2026-10-30' })).toMatchObject({
      desde: new Date('2026-10-01T05:00:00Z'),
      hasta: new Date('2026-10-31T04:59:59.999Z'),
      accion: null,
      antesDe: null,
    });
    expect(() => filtroAuditoria({ desde: '2026-10-30', hasta: '2026-10-01' })).toThrow('anterior a «hasta»');
    expect(() => filtroAuditoria({ desde: 'ayer' })).toThrow('no es válida');
    expect(() => filtroAuditoria({ accion: 'BORRAR_TODO' })).toThrow('no se audita');
    expect(() => filtroAuditoria({ actorId: 'no-es-uuid' })).toThrow('El actor no es válido');
    expect(() => filtroAuditoria({ antesDe: 'basura' })).toThrow('La página pedida no es válida');
    const cursor = cursorDe({ ocurridoEn: new Date('2026-10-30T15:00:00Z'), id: ADMIN });
    expect(filtroAuditoria({ antesDe: cursor }).antesDe).toEqual({ ocurridoEn: new Date('2026-10-30T15:00:00Z'), id: ADMIN });
  });

  it('un registro necesita acción y tipo de recurso', () => {
    const base = { id: 'a', actorId: null, actorRol: null, recursoId: null, ip: null, datos: {}, ocurridoEn: new Date() };
    expect(() => Auditoria.registrar({ ...base, accion: ' ', recursoTipo: 'aula' })).toThrow('la acción y el tipo de recurso');
  });
});

describe('Auditoría: registrar, consultar y depurar (RF-077)', () => {
  let e: EntornoAdministracion;
  beforeEach(() => {
    e = crearEntornoAdministracion();
  });

  const registrar = (accion: string, minutosAtras: number, extra: Partial<Parameters<EntornoAdministracion['registrar']['ejecutar']>[0]> = {}) =>
    e.registrar.ejecutar({
      actorId: ADMIN,
      actorRol: null,
      accion,
      recursoTipo: 'cuenta_adulta',
      recursoId: 'doc-1',
      ip: '198.51.100.7',
      datos: { evento: 'iam.CuentaSuspendida', agregadoId: 'doc-1', motivo: 'prueba' },
      ocurridoEn: new Date(e.reloj.ahora().getTime() - minutosAtras * 60_000),
      ...extra,
    });

  it('una IP inválida se guarda como desconocida, sin perder el registro', async () => {
    await registrar('CUENTA_SUSPENDIDA', 0, { ip: 'no-es-ip' });
    expect(e.auditoria.filas[0]).toMatchObject({ accion: 'CUENTA_SUSPENDIDA', ip: null });
  });

  it('muestra lo más reciente primero, con el nombre de la acción y de quien la hizo, sin datos repetidos', async () => {
    e.cuentas.adultos.set(ADMIN, { nombre: 'Ana Admin', rol: 'ADMIN_PLATAFORMA' });
    await registrar('CUENTA_SUSPENDIDA', 10);
    await registrar('CUENTA_REACTIVADA', 5);
    await registrar('ESTUDIANTE_BLOQUEADO', 1, { actorId: '0192f000-0000-7000-8000-0000000e5701', actorRol: 'ESTUDIANTE', recursoTipo: 'perfil_estudiante' });
    const { registros, siguiente } = await e.consulta.consultar({});
    expect(siguiente).toBeNull();
    expect(registros.map((r) => r.accion)).toEqual(['ESTUDIANTE_BLOQUEADO', 'CUENTA_REACTIVADA', 'CUENTA_SUSPENDIDA']);
    expect(registros[1]).toMatchObject({
      etiqueta: 'Cuenta reactivada',
      actor: { id: ADMIN, nombre: 'Ana Admin', rol: 'ADMIN_PLATAFORMA' },
      recurso: { tipo: 'cuenta_adulta', id: 'doc-1' },
      ip: '198.51.100.7',
      datos: { motivo: 'prueba' },
    });
    expect(registros[0]?.actor).toEqual({ id: '0192f000-0000-7000-8000-0000000e5701', nombre: null, rol: 'ESTUDIANTE' });
  });

  it('filtra por acción, actor, recurso y fechas', async () => {
    await registrar('CUENTA_SUSPENDIDA', 3 * 24 * 60);
    await registrar('CUENTA_REACTIVADA', 60, { recursoId: 'doc-2' });
    await registrar('CUENTA_SUSPENDIDA', 30, { actorId: null });
    expect((await e.consulta.consultar({ accion: 'CUENTA_SUSPENDIDA' })).registros).toHaveLength(2);
    expect((await e.consulta.consultar({ actorId: ADMIN })).registros).toHaveLength(2);
    expect((await e.consulta.consultar({ recursoTipo: 'cuenta_adulta', recursoId: 'doc-2' })).registros.map((r) => r.accion)).toEqual(['CUENTA_REACTIVADA']);
    expect((await e.consulta.consultar({ desde: '2026-10-30' })).registros).toHaveLength(2);
    expect((await e.consulta.consultar({ hasta: '2026-10-29' })).registros).toHaveLength(1);
  });

  it(`pagina de ${POR_PAGINA} en ${POR_PAGINA}, sin repetir ni saltar registros (aunque compartan la hora)`, async () => {
    for (let i = 0; i < POR_PAGINA + 5; i++) await registrar('CUENTA_SUSPENDIDA', i < 10 ? 5 : i);
    const primera = await e.consulta.consultar({});
    expect(primera.registros).toHaveLength(POR_PAGINA);
    expect(primera.siguiente).not.toBeNull();
    const segunda = await e.consulta.consultar({ antesDe: primera.siguiente as string });
    expect(segunda.registros).toHaveLength(5);
    expect(segunda.siguiente).toBeNull();
    const ids = [...primera.registros, ...segunda.registros].map((r) => r.id);
    expect(new Set(ids).size).toBe(POR_PAGINA + 5);
  });

  it('las acciones para el filtro, con su nombre', () => {
    expect(e.consulta.acciones()).toContainEqual({ accion: 'DATOS_EXPORTADOS', etiqueta: 'Datos de un estudiante exportados' });
  });

  it('depurar borra solo lo que superó los 2 años (con un día de margen)', async () => {
    const dosAnios = 2 * 365 * 24 * 60;
    await registrar('CUENTA_SUSPENDIDA', dosAnios + 3 * 24 * 60); // más de 2 años y 1 día: se borra
    await registrar('CUENTA_SUSPENDIDA', dosAnios + 12 * 60 - 2 * 24 * 60); // aún dentro de la retención
    await registrar('CUENTA_REACTIVADA', 5);
    expect(await e.consulta.depurar(e.reloj.ahora())).toBe(1);
    expect(e.auditoria.filas).toHaveLength(2);
    expect(await e.consulta.depurar(e.reloj.ahora())).toBe(0);
  });
});

describe('Docentes, instituciones y parámetros (RF-076, RF-078)', () => {
  let e: EntornoAdministracion;
  beforeEach(() => {
    e = crearEntornoAdministracion();
  });

  it('lista cada docente con sus aulas; suspendido con aulas, sus aulas quedan en solo lectura', async () => {
    const rosa = await e.docentes.darDeAlta({ nombre: 'Rosa Pérez', email: 'rosa@ie.pe' }, ADMIN);
    const luis = await e.docentes.darDeAlta({ nombre: 'Luis Ramos', email: 'luis@ie.pe' }, ADMIN);
    e.escuela.aulas.set(rosa.id, { aulas: 2, estudiantes: 41 });
    expect(rosa).toMatchObject({ estado: 'PENDIENTE_VERIFICACION', aulas: 0, aulasEnSoloLectura: false });

    expect(await e.docentes.suspender(rosa.id, ADMIN)).toMatchObject({ estado: 'SUSPENDIDA', aulas: 2, estudiantes: 41, aulasEnSoloLectura: true });
    expect(await e.docentes.suspender(luis.id, ADMIN)).toMatchObject({ estado: 'SUSPENDIDA', aulasEnSoloLectura: false });
    expect((await e.docentes.listar({ estado: 'SUSPENDIDA' })).map((d) => [d.nombre, d.aulasEnSoloLectura])).toEqual([
      ['Rosa Pérez', true],
      ['Luis Ramos', false],
    ]);
    expect(await e.docentes.reactivar(rosa.id, ADMIN)).toMatchObject({ estado: 'ACTIVA', aulasEnSoloLectura: false });
    expect(e.cuentas.acciones).toEqual([`alta:${ADMIN}`, `alta:${ADMIN}`, `suspender:${rosa.id}:${ADMIN}`, `suspender:${luis.id}:${ADMIN}`, `reactivar:${rosa.id}:${ADMIN}`]);
  });

  it('instituciones y parámetros pasan a su módulo con la administradora como actor', async () => {
    const i = await e.instituciones.crear({ nombre: 'IE 70001' }, ADMIN);
    expect(await e.instituciones.cambiarEstado(i.id, 'SUSPENDIDA', ADMIN)).toMatchObject({ estado: 'SUSPENDIDA' });
    expect(await e.instituciones.listar()).toHaveLength(1);
    expect((await e.parametros.publicar({ puntos: {} }, ADMIN)).version).toBe(2);
    expect(e.gamificacion.publicadas).toEqual([{ entrada: { puntos: {} }, adminId: ADMIN }]);
    expect((await e.parametros.vigentes()).version).toBe(1);
    expect(await e.parametros.historial()).toHaveLength(1);
  });
});
