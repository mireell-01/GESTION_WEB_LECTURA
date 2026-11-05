import { beforeEach, describe, expect, it } from 'vitest';

import { CrearAulaUseCase } from '../../../../src/modules/escuela/application/use-cases/crear-aula.use-case';
import { InstitucionesUseCase } from '../../../../src/modules/escuela/application/use-cases/instituciones.use-case';
import {
  CanjearInvitacionFamiliarUseCase,
  GenerarInvitacionFamiliarUseCase,
} from '../../../../src/modules/escuela/application/use-cases/invitaciones-familiar.use-case';
import { Aula } from '../../../../src/modules/escuela/domain/entities/aula';
import {
  AulaSoloLecturaError,
  InstitucionInvalidaError,
  InstitucionRepetidaError,
  InstitucionSuspendidaError,
} from '../../../../src/modules/escuela/domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../../../src/modules/escuela/domain/events/eventos-escuela';
import { normalizarNombreInstitucion } from '../../../../src/modules/escuela/domain/services/institucion';
import { CodigoAula } from '../../../../src/modules/escuela/domain/value-objects/codigo-aula';
import { aulaDe, crearEntornoEscuela, EntornoEscuela, estudianteEn, InstitucionesEnMemoria } from '../dobles';

/** Nivel 1 — RF-076 (Módulo 12): instituciones, aulas nuevas y aulas de un docente suspendido. */
const ADMIN = 'admin-1';
const DOCENTE = 'doc-1';

describe('[Escuela][Menor][Fast] Instituciones educativas (RF-076)', () => {
  let e: EntornoEscuela;
  let repo: InstitucionesEnMemoria;
  let instituciones: InstitucionesUseCase;
  let crearAula: CrearAulaUseCase;

  beforeEach(() => {
    e = crearEntornoEscuela();
    repo = new InstitucionesEnMemoria(e.aulas, e.matriculas);
    instituciones = new InstitucionesUseCase(repo, e.bus, e.generarId, e.reloj.ahora);
    crearAula = new CrearAulaUseCase(e.aulas, e.identidad, e.bus, e.aleatorio, e.generarId, e.reloj.ahora, instituciones);
  });

  /** Un aula ya creada por una docente con el nombre de institución que escribió. */
  const aulaCon = async (institucion: string, docenteId = DOCENTE) => {
    const aula = Aula.crear({ id: e.generarId(), docenteId, nombre: '3.° B', grado: '3', anioLectivo: 2026, institucion, codigo: CodigoAula.desdePersistencia('ABCDEF'), ahora: e.reloj.ahora() });
    await e.aulas.guardar(aula);
    return aula;
  };
  const nuevaAula = (institucion: string) =>
    crearAula.ejecutar({ docenteId: DOCENTE, nombre: '4.° A', grado: '4', anioLectivo: 2026, institucion, autoridadConsentimiento: 'Dir. Rosa Paz' });

  it('compara nombres sin tildes, mayúsculas, puntos ni espacios de más', () => {
    expect(normalizarNombreInstitucion('  I.E. N.° 70 001  Santa Rosa ')).toBe('ie n 70 001 santa rosa');
    expect(normalizarNombreInstitucion('IE N 70 001 SANTA ROSA')).toBe(normalizarNombreInstitucion('i.e. n° 70 001 santa rosa'));
  });

  it('registra una institución y vincula las aulas que ya la nombraban igual', async () => {
    const igual = await aulaCon('I.E. N.° 70001 Santa Rosa');
    await aulaCon('IE 70002 San Juan');
    const i = await instituciones.crear({ nombre: ' IE  N° 70001   Santa Rosa ', codigoModular: '0234567', region: 'Puno', adminId: ADMIN });
    expect(i).toMatchObject({ nombre: 'IE N° 70001 Santa Rosa', codigoModular: '0234567', region: 'Puno', estado: 'ACTIVA', aulas: 1, docentes: 1, estudiantes: 0 });
    expect(repo.vinculos.get(igual.id)).toBe(i.id);
    expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_ESCUELA.INSTITUCION_CREADA, agregadoId: i.id, datos: { actorId: ADMIN, rol: 'ADMIN_PLATAFORMA', aulasVinculadas: 1 } });
  });

  it('valida los datos y no repite nombre ni código modular', async () => {
    await instituciones.crear({ nombre: 'IE 70001 Santa Rosa', codigoModular: '0234567', adminId: ADMIN });
    await expect(instituciones.crear({ nombre: 'I.E. 70001 SANTA ROSA', adminId: ADMIN })).rejects.toThrow(InstitucionRepetidaError);
    await expect(instituciones.crear({ nombre: 'IE 70002 San Juan', codigoModular: '0234567', adminId: ADMIN })).rejects.toThrow('código modular');
    await expect(instituciones.crear({ nombre: 'IE', adminId: ADMIN })).rejects.toThrow(InstitucionInvalidaError);
    await expect(instituciones.crear({ nombre: 'IE 70003', codigoModular: '12345', adminId: ADMIN })).rejects.toThrow('7 dígitos');
    await expect(instituciones.crear({ nombre: 'IE 70003', region: 'x'.repeat(61), adminId: ADMIN })).rejects.toThrow('60 caracteres');
  });

  it('cuenta sus aulas activas, sus docentes y sus estudiantes (un aula archivada no cuenta)', async () => {
    const i = await instituciones.crear({ nombre: 'IE 70001 Santa Rosa', adminId: ADMIN });
    const a1 = await aulaCon('IE 70001 Santa Rosa');
    const a2 = await aulaCon('IE 70001 Santa Rosa', 'doc-2');
    const archivada = await aulaCon('IE 70001 Santa Rosa', 'doc-3');
    for (const a of [a1, a2, archivada]) await instituciones.vincularAula(a.id, i.id);
    await estudianteEn(e, a1, 'Mateo');
    await estudianteEn(e, a2, 'Ana');
    await estudianteEn(e, archivada, 'Luis');
    archivada.archivar(e.reloj.ahora());
    expect((await instituciones.listar())[0]).toMatchObject({ aulas: 2, docentes: 2, estudiantes: 2 });
  });

  it('suspender solo la marca: ya no se elige para aulas nuevas; reactivarla la devuelve', async () => {
    const i = await instituciones.crear({ nombre: 'IE 70001 Santa Rosa', adminId: ADMIN });
    await instituciones.crear({ nombre: 'IE 70002 San Juan', adminId: ADMIN });
    expect(await instituciones.cambiarEstado(i.id, 'SUSPENDIDA', ADMIN)).toMatchObject({ estado: 'SUSPENDIDA' });
    await instituciones.cambiarEstado(i.id, 'SUSPENDIDA', ADMIN);
    expect(e.bus.nombres().filter((n) => n === EVENTOS_ESCUELA.INSTITUCION_SUSPENDIDA)).toHaveLength(1);
    expect((await instituciones.activas()).map((x) => x.nombre)).toEqual(['IE 70002 San Juan']);

    await expect(nuevaAula('i.e. 70001 santa rosa')).rejects.toThrow(InstitucionSuspendidaError);
    expect(e.aulas.filas.size).toBe(0);

    await instituciones.cambiarEstado(i.id, 'ACTIVA', ADMIN);
    expect(e.bus.nombres()).toContain(EVENTOS_ESCUELA.INSTITUCION_REACTIVADA);
    const aula = await nuevaAula('IE 70001 Santa Rosa');
    expect(repo.vinculos.get(aula.id)).toBe(i.id);
    await expect(instituciones.cambiarEstado('no-existe', 'ACTIVA', ADMIN)).rejects.toThrow('Institución no encontrada');
  });

  it('un aula con una institución que no está registrada se crea igual, sin vínculo (como hasta ahora)', async () => {
    const aula = await nuevaAula('IE 99999 La Esperanza');
    expect(aula.institucion).toBe('IE 99999 La Esperanza');
    expect(repo.vinculos.size).toBe(0);
  });
});

describe('[Escuela][Core][Fast] Aulas de un docente suspendido: solo lectura (RF-076)', () => {
  it('el código para la familia ya no se puede canjear; nada se gasta ni se vincula', async () => {
    const e = crearEntornoEscuela();
    const generar = new GenerarInvitacionFamiliarUseCase(e.aulas, e.matriculas, e.invitaciones, e.identidad, e.bus, e.huella, e.aleatorio, e.generarId, e.reloj.ahora);
    const canjear = new CanjearInvitacionFamiliarUseCase(e.aulas, e.matriculas, e.invitaciones, e.identidad, e.bus, e.huella, e.reloj.ahora);
    const aula = await aulaDe(e, DOCENTE);
    const mateo = await estudianteEn(e, aula, 'Mateo');
    const { codigo } = await generar.ejecutar({ docenteId: DOCENTE, estudianteId: mateo });

    e.identidad.suspendidas.add(DOCENTE);
    await expect(canjear.ejecutar({ cuentaFamiliarId: 'fam-1', codigo })).rejects.toThrow(AulaSoloLecturaError);
    expect(e.identidad.vinculos).toEqual([]);
    expect([...e.invitaciones.filas.values()][0]?.usadaEn).toBeNull();

    // Al reactivarla, el mismo código sirve.
    e.identidad.suspendidas.delete(DOCENTE);
    await canjear.ejecutar({ cuentaFamiliarId: 'fam-1', codigo });
    expect(e.identidad.vinculos).toHaveLength(1);
  });
});
