import { beforeEach, describe, expect, it } from 'vitest';

import {
  CatalogoDelAulaUseCase,
  ListarAsignacionesUseCase,
  MisionesDelDocenteUseCase,
} from '../../../../src/modules/escuela/application/use-cases/consultar-asignaciones.use-case';
import {
  CerrarAsignacionUseCase,
  CrearAsignacionInput,
  CrearAsignacionUseCase,
} from '../../../../src/modules/escuela/application/use-cases/gestionar-asignaciones.use-case';
import {
  AsignacionDuplicadaError,
  AulaArchivadaError,
  ContenidoNoDisponibleError,
  DatoAsignacionInvalidoError,
} from '../../../../src/modules/escuela/domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../../../src/modules/escuela/domain/events/eventos-escuela';
import { NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { aulaDe, crearEntornoEscuela, EntornoEscuela, estudianteEn } from '../dobles';

/** Nivel 1 — Asignaciones (RF-018): crear, listar, cerrar y verlas en la aventura del estudiante. */
const DOCENTE = 'doc-1';

describe('Asignaciones de la docente (RF-018)', () => {
  let e: EntornoEscuela;
  let crear: CrearAsignacionUseCase;
  let listar: ListarAsignacionesUseCase;
  let misiones: MisionesDelDocenteUseCase;

  beforeEach(() => {
    e = crearEntornoEscuela(); // jueves 15/10/2026, 10:00 en Lima
    crear = new CrearAsignacionUseCase(e.aulas, e.matriculas, e.asignaciones, e.catalogo, e.identidad, e.bus, e.generarId, e.reloj.ahora);
    listar = new ListarAsignacionesUseCase(e.aulas, e.asignaciones, e.identidad, e.reloj.ahora);
    misiones = new MisionesDelDocenteUseCase(e.aulas, e.matriculas, e.asignaciones, e.reloj.ahora);
  });

  const asignar = (aulaId: string, cambios: Partial<CrearAsignacionInput> = {}) =>
    crear.ejecutar({ docenteId: DOCENTE, aulaId, tipo: 'LECTURA', contenidoId: 'lectura-1', fechaLimite: '2026-10-23', ...cambios });

  it('asigna una lectura publicada a toda el aula: empieza hoy y toma el título del catálogo', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const vista = await asignar(aula.id);

    expect(vista).toMatchObject({
      tipo: 'LECTURA', titulo: 'El zorro y la luna', paraTodaElAula: true, estudiantes: [],
      fechaInicio: '2026-10-15', fechaLimite: '2026-10-23', estado: 'ACTIVA',
    });
    expect(e.bus.publicados.at(-1)).toMatchObject({
      nombreEvento: EVENTOS_ESCUELA.ASIGNACION_CREADA,
      datos: { actorId: DOCENTE, aulaId: aula.id, tipo: 'LECTURA', contenidoId: 'lectura-1', estudianteIds: [] },
    });
  });

  it('asigna una misión a estudiantes elegidos, solo si están matriculados en el aula', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const mateo = await estudianteEn(e, aula, 'Mateo');
    const ana = await estudianteEn(e, aula, 'Ana', 'zorro');
    const otraAula = await aulaDe(e, DOCENTE, { nombre: '4.° A' });
    const ajeno = await estudianteEn(e, otraAula, 'Rita');

    const vista = await asignar(aula.id, { tipo: 'MISION', contenidoId: 'mision-1', fechaInicio: '2026-10-19', estudianteIds: [mateo, ana] });
    expect(vista).toMatchObject({ titulo: 'El mapa perdido', paraTodaElAula: false, estado: 'PROGRAMADA' });
    expect(vista.estudiantes.map((s) => s.alias)).toEqual(['Ana', 'Mateo']);

    await expect(asignar(aula.id, { contenidoId: 'lectura-2', estudianteIds: [mateo, ajeno] })).rejects.toThrow(DatoAsignacionInvalidoError);
  });

  it('rechaza contenido no publicado, repetir uno abierto y asignar en un aula archivada', async () => {
    const aula = await aulaDe(e, DOCENTE);
    await expect(asignar(aula.id, { contenidoId: 'no-existe' })).rejects.toThrow(ContenidoNoDisponibleError);
    await expect(asignar(aula.id, { tipo: 'MISION', contenidoId: 'lectura-1' })).rejects.toThrow(/misión no está disponible/);

    await asignar(aula.id);
    await expect(asignar(aula.id, { fechaInicio: '2026-11-02', fechaLimite: '2026-11-06' })).rejects.toThrow(AsignacionDuplicadaError);

    aula.archivar(e.reloj.ahora());
    await expect(asignar(aula.id, { contenidoId: 'lectura-2' })).rejects.toThrow(AulaArchivadaError);
  });

  it('una lectura se puede volver a asignar cuando la anterior ya venció o se cerró', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const primera = await asignar(aula.id, { fechaLimite: '2026-10-16' });
    e.reloj.avanzarMin(3 * 24 * 60); // domingo 18
    await expect(asignar(aula.id, { fechaLimite: '2026-10-30' })).resolves.toMatchObject({ estado: 'ACTIVA' });
    expect((await listar.ejecutar({ docenteId: DOCENTE, aulaId: aula.id })).find((a) => a.id === primera.id)?.estado).toBe('VENCIDA');
  });

  it('la lista pone primero las que están en curso y guarda los estados que cambió el tiempo', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const vence = await asignar(aula.id, { contenidoId: 'lectura-2', fechaLimite: '2026-10-16' });
    const programada = await asignar(aula.id, { tipo: 'MISION', contenidoId: 'mision-1', fechaInicio: '2026-10-19', fechaLimite: '2026-10-30' });
    const larga = await asignar(aula.id, { fechaLimite: '2026-11-20' });
    e.asignaciones.guardadas = 0;

    e.reloj.avanzarMin(4 * 24 * 60); // lunes 19, 10:00 en Lima
    const lista = await listar.ejecutar({ docenteId: DOCENTE, aulaId: aula.id });
    expect(lista.map((a) => [a.id, a.estado])).toEqual([
      [programada.id, 'ACTIVA'],
      [larga.id, 'ACTIVA'],
      [vence.id, 'VENCIDA'],
    ]);
    expect(e.asignaciones.guardadas).toBe(2); // la vencida y la que empezó hoy
    expect(e.asignaciones.filas.get(vence.id)?.estado).toBe('VENCIDA');
  });

  it('cerrar la saca de la aventura; cerrar dos veces no publica otro evento; una ajena responde 404', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const mateo = await estudianteEn(e, aula);
    const asignacion = await asignar(aula.id);
    const cerrar = new CerrarAsignacionUseCase(e.aulas, e.asignaciones, e.bus, e.reloj.ahora);

    expect(await misiones.ejecutar(mateo)).toHaveLength(1);
    await cerrar.ejecutar({ docenteId: DOCENTE, aulaId: aula.id, asignacionId: asignacion.id });
    await cerrar.ejecutar({ docenteId: DOCENTE, aulaId: aula.id, asignacionId: asignacion.id });
    expect(e.bus.nombres().filter((n) => n === EVENTOS_ESCUELA.ASIGNACION_CERRADA)).toHaveLength(1);
    expect(await misiones.ejecutar(mateo)).toEqual([]);

    const otra = await aulaDe(e, DOCENTE, { nombre: '4.° A' });
    await expect(cerrar.ejecutar({ docenteId: DOCENTE, aulaId: otra.id, asignacionId: asignacion.id })).rejects.toThrow(NoEncontradoError);
  });

  it('"Misión del docente": el estudiante ve solo lo que es para él y está en curso', async () => {
    const aula = await aulaDe(e, DOCENTE, { nombre: '3.° B' });
    const mateo = await estudianteEn(e, aula, 'Mateo');
    const ana = await estudianteEn(e, aula, 'Ana', 'zorro');
    await asignar(aula.id, { fechaLimite: '2026-10-23' });
    await asignar(aula.id, { tipo: 'MISION', contenidoId: 'mision-1', fechaLimite: '2026-10-20', estudianteIds: [ana] });
    await asignar(aula.id, { contenidoId: 'lectura-2', fechaInicio: '2026-10-19', fechaLimite: '2026-10-30' });

    expect(await misiones.ejecutar(mateo)).toEqual([
      { id: expect.any(String), tipo: 'LECTURA', contenidoId: 'lectura-1', titulo: 'El zorro y la luna', fechaLimite: '2026-10-23', aula: '3.° B' },
    ]);
    expect((await misiones.ejecutar(ana)).map((m) => m.titulo)).toEqual(['El mapa perdido', 'El zorro y la luna']);

    // Al retirarse del aula o archivarse esta, ya no ve las misiones.
    (await e.matriculas.buscar(aula.id, mateo))?.retirar(e.reloj.ahora());
    expect(await misiones.ejecutar(mateo)).toEqual([]);
    aula.archivar(e.reloj.ahora());
    expect(await misiones.ejecutar(ana)).toEqual([]);
  });

  it('el catálogo del aula separa lecturas y misiones publicadas', async () => {
    const aula = await aulaDe(e, DOCENTE);
    const catalogo = await new CatalogoDelAulaUseCase(e.aulas, e.catalogo).ejecutar({ docenteId: DOCENTE, aulaId: aula.id });
    expect(catalogo.lecturas.map((c) => c.titulo)).toEqual(['El zorro y la luna', 'Rimas del río']);
    expect(catalogo.misiones.map((c) => c.detalle)).toEqual(['Mundo 1 · Explorador']);
    await expect(new CatalogoDelAulaUseCase(e.aulas, e.catalogo).ejecutar({ docenteId: 'otra', aulaId: aula.id })).rejects.toThrow(NoEncontradoError);
  });
});
