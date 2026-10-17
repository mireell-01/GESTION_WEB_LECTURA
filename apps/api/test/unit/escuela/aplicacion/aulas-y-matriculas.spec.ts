import { beforeEach, describe, expect, it } from 'vitest';

import { DetalleAulaUseCase, ListarAulasUseCase } from '../../../../src/modules/escuela/application/use-cases/consultar-aulas.use-case';
import { CrearAulaUseCase } from '../../../../src/modules/escuela/application/use-cases/crear-aula.use-case';
import { GenerarTarjetasUseCase } from '../../../../src/modules/escuela/application/use-cases/generar-tarjetas.use-case';
import { ArchivarAulaUseCase, RetirarEstudianteUseCase } from '../../../../src/modules/escuela/application/use-cases/gestionar-aula.use-case';
import { CrearAsignacionUseCase } from '../../../../src/modules/escuela/application/use-cases/gestionar-asignaciones.use-case';
import {
  MAX_FILAS_CSV,
  MatricularEstudiantesUseCase,
} from '../../../../src/modules/escuela/application/use-cases/matricular-estudiantes.use-case';
import { ALFABETO_CODIGO_AULA } from '../../../../src/modules/escuela/domain/value-objects/codigo-aula';
import { AulaArchivadaError, AulaLlenaError } from '../../../../src/modules/escuela/domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../../../src/modules/escuela/domain/events/eventos-escuela';
import { ErrorDeNegocio, NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { aulaDe, crearEntornoEscuela, EntornoEscuela, estudianteEn } from '../dobles';

/** Nivel 1 — Casos de uso de aulas, matrículas y tarjetas (RF-014 a RF-017, RF-020, RN-17). */
const DOCENTE = 'doc-1';
const OTRA_DOCENTE = 'doc-2';

describe('Crear y consultar aulas (RF-014, RN-17)', () => {
  let e: EntornoEscuela;
  beforeEach(() => {
    e = crearEntornoEscuela();
  });

  const crearAula = () =>
    new CrearAulaUseCase(e.aulas, e.identidad, e.bus, e.aleatorio, e.generarId, e.reloj.ahora).ejecutar({
      docenteId: DOCENTE, nombre: '3.° B', grado: '3', anioLectivo: 2026, institucion: 'IE 1234', autoridadConsentimiento: 'Dir. Rosa Paz',
    });

  it('genera un código único (reintenta si ya existe) y registra el consentimiento institucional', async () => {
    e.encolarAleatorios([0, 0, 0, 0, 0, 0]); // "AAAAAA" para la primera aula
    const primera = await crearAula();
    e.encolarAleatorios([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]); // repite "AAAAAA" → reintenta → "BBBBBB"
    const segunda = await crearAula();

    expect(primera.codigo).toBe('AAAAAA');
    expect(segunda.codigo).toBe('BBBBBB');
    expect([...segunda.codigo].every((c) => ALFABETO_CODIGO_AULA.includes(c))).toBe(true);
    expect(e.identidad.consentimientos).toEqual([
      { docenteId: DOCENTE, aulaId: primera.id, otorganteNombre: 'Dir. Rosa Paz' },
      { docenteId: DOCENTE, aulaId: segunda.id, otorganteNombre: 'Dir. Rosa Paz' },
    ]);
    expect(e.bus.nombres()).toEqual([EVENTOS_ESCUELA.AULA_CREADA, EVENTOS_ESCUELA.AULA_CREADA]);
  });

  it('lista solo las aulas de la docente, activas primero, con su número de estudiantes', async () => {
    const archivada = await aulaDe(e, DOCENTE, { nombre: '2.° A' });
    archivada.archivar(e.reloj.ahora());
    const activa = await aulaDe(e, DOCENTE, { nombre: '3.° B' });
    await aulaDe(e, OTRA_DOCENTE, { nombre: 'Ajena' });
    await estudianteEn(e, activa, 'Mateo');
    await estudianteEn(e, activa, 'Lucía', 'zorro');

    const lista = await new ListarAulasUseCase(e.aulas, e.matriculas).ejecutar(DOCENTE);
    expect(lista.map((a) => [a.nombre, a.estado, a.totalEstudiantes])).toEqual([
      ['3.° B', 'ACTIVA', 2],
      ['2.° A', 'ARCHIVADA', 0],
    ]);
  });

  it('el detalle muestra los estudiantes en orden alfabético; un aula ajena responde 404', async () => {
    const aula = await aulaDe(e, DOCENTE);
    await estudianteEn(e, aula, 'Mateo');
    await estudianteEn(e, aula, 'Ana', 'zorro');
    const detalle = new DetalleAulaUseCase(e.aulas, e.matriculas, e.identidad);

    const { aula: vista, estudiantes } = await detalle.ejecutar({ docenteId: DOCENTE, aulaId: aula.id });
    expect(vista.totalEstudiantes).toBe(2);
    expect(estudiantes.map((s) => s.alias)).toEqual(['Ana', 'Mateo']);
    expect(estudiantes[0]).toMatchObject({ bloqueado: false, familiaresVinculados: 0 });
    await expect(detalle.ejecutar({ docenteId: OTRA_DOCENTE, aulaId: aula.id })).rejects.toThrow(NoEncontradoError);
  });
});

describe('Matricular estudiantes (RF-015, RF-016)', () => {
  let e: EntornoEscuela;
  let matricular: MatricularEstudiantesUseCase;
  beforeEach(() => {
    e = crearEntornoEscuela();
    matricular = new MatricularEstudiantesUseCase(e.aulas, e.matriculas, e.identidad, e.bus, e.aleatorio, e.generarId, e.reloj.ahora);
  });

  it('matricula uno bajo el aula y no devuelve el PIN: solo aparecerá en la tarjeta impresa', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const r = await matricular.uno({ docenteId: DOCENTE, aulaId: aula.id, alias: 'Mateo', anioNacimiento: 2017, mesNacimiento: 5, avatar: 'leon' });

    expect(r).toEqual({ estudianteId: expect.any(String), alias: 'Mateo', avatar: 'leon' });
    expect(JSON.stringify(r)).not.toMatch(/pin/i);
    expect((await e.matriculas.listarActivasPorAula(aula.id)).map((m) => m.estudianteId)).toEqual([r.estudianteId]);
    expect(e.identidad.perfiles.get(r.estudianteId)?.pin).toMatch(/^\d{4}$/);
    expect(e.bus.nombres()).toEqual([EVENTOS_ESCUELA.ESTUDIANTE_MATRICULADO]);
  });

  it('rechaza alias + avatar repetidos en el aula', async () => {
    const aula = await aulaDe(e, DOCENTE);
    await estudianteEn(e, aula, 'Mateo', 'leon');
    await expect(
      matricular.uno({ docenteId: DOCENTE, aulaId: aula.id, alias: 'mateo', anioNacimiento: 2017, mesNacimiento: 5, avatar: 'leon' }),
    ).rejects.toThrow(/alias y avatar/);
  });

  it('no matricula en un aula ajena ni en una archivada', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const datos = { alias: 'Mateo', anioNacimiento: 2017, mesNacimiento: 5, avatar: 'leon' };
    await expect(matricular.uno({ docenteId: OTRA_DOCENTE, aulaId: aula.id, ...datos })).rejects.toThrow(NoEncontradoError);
    aula.archivar(e.reloj.ahora());
    await expect(matricular.uno({ docenteId: DOCENTE, aulaId: aula.id, ...datos })).rejects.toThrow(AulaArchivadaError);
  });

  it('CSV: salta el encabezado, asigna avatares y reporta las filas rechazadas con su motivo', async () => {
    const aula = await aulaDe(e, DOCENTE);
    e.identidad.rechazar.set('Bebé', new ErrorDeNegocio('La edad debe estar entre 6 y 12 años'));
    const csv = ['\uFEFFalias,año,mes,avatar', 'Ana;2017;3;zorro', 'Beto,2016,8', ',2017,1', 'Caro,2017,2,dragon', 'Bebé,2024,1,panda', '', 'Dani,2018,11,RANA'].join('\r\n');

    const r = await matricular.desdeCsv({ docenteId: DOCENTE, aulaId: aula.id, csv });
    expect(r.matriculados.map((m) => [m.alias, m.avatar])).toEqual([
      ['Ana', 'zorro'],
      ['Beto', 'panda'],
      ['Dani', 'rana'],
    ]);
    expect(r.rechazadas.map((f) => [f.fila, f.motivo])).toEqual([
      [4, 'Formato esperado: alias, año, mes, avatar (opcional)'],
      [5, 'Avatar desconocido: dragon'],
      [6, 'La edad debe estar entre 6 y 12 años'],
    ]);
  });

  it(`CSV: hasta ${MAX_FILAS_CSV} filas, no vacío y sin superar el cupo del aula`, async () => {
    const aula = await aulaDe(e, DOCENTE);
    const filas = (n: number) => Array.from({ length: n }, (_, i) => `Niño${i},2017,1`).join('\n');
    await expect(matricular.desdeCsv({ docenteId: DOCENTE, aulaId: aula.id, csv: 'alias,año,mes\n' })).rejects.toThrow(/no tiene filas/);
    await expect(matricular.desdeCsv({ docenteId: DOCENTE, aulaId: aula.id, csv: filas(61) })).rejects.toThrow(/hasta 60/);
    await expect(matricular.desdeCsv({ docenteId: DOCENTE, aulaId: aula.id, csv: filas(46) })).rejects.toThrow(AulaLlenaError);
  });
});

describe('Tarjetas de acceso (RF-017, CR-01)', () => {
  let e: EntornoEscuela;
  let tarjetas: GenerarTarjetasUseCase;
  beforeEach(() => {
    e = crearEntornoEscuela();
    tarjetas = new GenerarTarjetasUseCase(e.aulas, e.matriculas, e.identidad, e.tarjetas, e.bus, e.aleatorio, e.reloj.ahora);
  });

  it('asigna un PIN nuevo a cada elegido y lo pone solo en el PDF (sin código de aula)', async () => {
    const aula = await aulaDe(e, DOCENTE, { nombre: '3.° B' });
    const mateo = await estudianteEn(e, aula, 'Mateo');
    const ana = await estudianteEn(e, aula, 'Ana', 'zorro');
    const pinAnterior = e.identidad.perfiles.get(mateo)?.pin;
    e.encolarAleatorios([5, 7, 3, 9, 2, 8, 6, 4]);

    const hoja = await tarjetas.ejecutar({ docenteId: DOCENTE, aulaId: aula.id, estudianteIds: [mateo, ana, mateo, 'ajeno'] });

    expect(hoja).toMatchObject({ nombreArchivo: 'tarjetas-3-b.pdf', cantidad: 2 });
    const [impresa] = e.tarjetas.hojas;
    expect(impresa?.nombreAula).toBe('3.° B');
    expect(impresa?.tarjetas.map((t) => [t.alias, t.pin])).toEqual([
      ['Ana', e.identidad.perfiles.get(ana)?.pin],
      ['Mateo', e.identidad.perfiles.get(mateo)?.pin],
    ]);
    expect(e.identidad.perfiles.get(mateo)?.pin).not.toBe(pinAnterior);
    expect(Object.keys(impresa?.tarjetas[0] ?? {})).not.toContain('codigoAula');
    expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: EVENTOS_ESCUELA.TARJETAS_GENERADAS, datos: { cantidad: 2 } });
  });

  it('exige estudiantes del aula y un aula activa', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const mateo = await estudianteEn(e, aula);
    await expect(tarjetas.ejecutar({ docenteId: DOCENTE, aulaId: aula.id, estudianteIds: ['ajeno'] })).rejects.toThrow(/al menos un estudiante/);
    aula.archivar(e.reloj.ahora());
    await expect(tarjetas.ejecutar({ docenteId: DOCENTE, aulaId: aula.id, estudianteIds: [mateo] })).rejects.toThrow(AulaArchivadaError);
  });
});

describe('Retirar estudiantes y archivar el aula (RF-020)', () => {
  let e: EntornoEscuela;
  beforeEach(() => {
    e = crearEntornoEscuela();
  });

  it('retirar deja de contar al estudiante en el aula; retirarlo otra vez responde 404', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const mateo = await estudianteEn(e, aula);
    const retirar = new RetirarEstudianteUseCase(e.aulas, e.matriculas, e.bus, e.reloj.ahora);

    await retirar.ejecutar({ docenteId: DOCENTE, aulaId: aula.id, estudianteId: mateo });
    expect(await e.matriculas.listarActivasPorAula(aula.id)).toEqual([]);
    await expect(retirar.ejecutar({ docenteId: DOCENTE, aulaId: aula.id, estudianteId: mateo })).rejects.toThrow(NoEncontradoError);
  });

  it('archivar deja el aula en solo lectura, conserva las matrículas y cierra las asignaciones abiertas', async () => {
    const aula = await aulaDe(e, DOCENTE);
    await estudianteEn(e, aula);
    const asignacion = await new CrearAsignacionUseCase(
      e.aulas, e.matriculas, e.asignaciones, e.catalogo, e.identidad, e.bus, e.generarId, e.reloj.ahora,
    ).ejecutar({ docenteId: DOCENTE, aulaId: aula.id, tipo: 'LECTURA', contenidoId: 'lectura-1', fechaLimite: '2026-10-30' });

    const vista = await new ArchivarAulaUseCase(e.aulas, e.matriculas, e.asignaciones, e.bus, e.reloj.ahora).ejecutar({ docenteId: DOCENTE, aulaId: aula.id });
    expect(vista).toMatchObject({ estado: 'ARCHIVADA', totalEstudiantes: 1 });
    expect(e.asignaciones.filas.get(asignacion.id)?.estado).toBe('CERRADA');
    expect(e.bus.nombres().at(-1)).toBe(EVENTOS_ESCUELA.AULA_ARCHIVADA);
  });
});
