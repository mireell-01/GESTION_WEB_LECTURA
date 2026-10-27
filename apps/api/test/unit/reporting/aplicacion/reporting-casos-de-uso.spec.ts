import { beforeEach, describe, expect, it } from 'vitest';

import { SESIONES_DETALLE } from '../../../../src/modules/reporting/application/use-cases/detalle-estudiante.use-case';
import { ErrorDeNegocio, NoEncontradoError, SesionDeHistorial } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoReporting, EntornoReporting } from '../dobles';

/** Nivel 1 — Casos de uso del seguimiento docente con dobles (RF-063 a RF-067, RN-17). */
const ROSA = 'docente-rosa';
const AULA = 'aula-4a';
const M = (n: number) => `est-${n}`;

const sesion = (id: string, respuestas: Partial<SesionDeHistorial['respuestas'][number]>[]): SesionDeHistorial => ({
  sesionId: id,
  lecturaId: 'l-killa',
  titulo: 'Killa y la llama',
  estado: 'FINALIZADA',
  esRepeticion: false,
  iniciadaEn: new Date('2026-10-20T15:00:00Z'),
  ultimaActividadEn: new Date('2026-10-20T15:10:00Z'),
  finalizadaEn: new Date('2026-10-20T15:10:00Z'),
  respuestas: respuestas.map((r, i) => ({
    itemId: `i-${i}`,
    enunciado: '¿Por qué?',
    habilidad: 'INF',
    modalidad: 'SELECCION',
    esCorrecta: true,
    pistasUsadas: 0,
    pistas: [],
    evidencias: [],
    respuesta: 'Le dolía algo',
    estado: 'ENVIADA',
    ...r,
  })),
});

describe('Seguimiento docente: panel, detalle, reporte y resumen semanal', () => {
  let e: EntornoReporting;

  beforeEach(() => {
    e = crearEntornoReporting();
    e.aulas.aulas.set(AULA, { id: AULA, nombre: '4.° A', grado: '4', estado: 'ACTIVA', docenteId: ROSA });
    const perfiles: [string, string][] = [['Sofía', 'unicornio'], ['Teo', 'panda'], ['Ana', 'buho'], ['Luis', 'tortuga'], ['Mateo', 'leon']];
    perfiles.forEach(([alias, avatar], i) => e.identidad.perfilesPorId.set(M(i + 1), { id: M(i + 1), alias, avatar, rangoEdad: 'R2' }));
    e.repo.estudiante(AULA, M(1), { LIT: 70, INF: 20, VOC: 70, CRI: 70, ARG: 30 });
    e.repo.estudiante(AULA, M(2), { LIT: 70, INF: 25, VOC: 70, CRI: 70, ARG: 70 });
    e.repo.estudiante(AULA, M(3), { LIT: 90, INF: 90, VOC: 85, CRI: 88, ARG: 86 });
    e.repo.estudiante(AULA, M(4), null, new Date('2026-10-20T15:00:00Z'));
    e.repo.estudiante(AULA, M(5), { LIT: 60, INF: 50, VOC: 55, CRI: 45, ARG: 40 });
    for (const n of [1, 2, 3]) e.repo.actividad.set(M(n), new Date('2026-10-20T15:00:00Z'));
    e.repo.actividad.set(M(5), new Date('2026-10-10T15:00:00Z')); // 11 días sin leer
    e.repo.semanal.push(
      { estudianteId: M(1), semana: '2026-10-19', lecturas: 2, minutos: 14, respuestas: 12 },
      { estudianteId: M(5), semana: '2026-10-05', lecturas: 1, minutos: 6, respuestas: 6 },
    );
    e.repo.desempenos.set(AULA, [{ habilidad: 'INF', estudiantes: 4, promedio: 46.25, descubriendo: 0, C: 2, B: 1, A: 0, AD: 1 }]);
    e.fichas.lista.push(
      { id: 'l-dificil', titulo: 'El cóndor', rangoEdad: 'R2', nivelDificultad: 3, tematica: 'Aves', habilidadesObjetivo: ['INF'] },
      { id: 'l-killa', titulo: 'Killa y la llama', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales', habilidadesObjetivo: ['INF', 'ARG'] },
      { id: 'l-r3', titulo: 'Para grandes', rangoEdad: 'R3', nivelDificultad: 1, tematica: 'Mar', habilidadesObjetivo: ['INF'] },
    );
  });

  describe('Panel (RF-063, RF-065, RF-066)', () => {
    it('mapa de calor por alias, grupo, alertas ordenadas, resumen y refuerzo con lectura', async () => {
      const p = await e.panel.panel(ROSA, AULA);
      expect(p.aula).toEqual({ id: AULA, nombre: '4.° A', grado: '4', estado: 'ACTIVA' });
      expect(p.actualizadoEn).toBe('2026-10-21T14:55:00.000Z');
      expect(p.estudiantes.map((x) => x.alias)).toEqual(['Ana', 'Luis', 'Mateo', 'Sofía', 'Teo']);
      expect(p.estudiantes.find((x) => x.alias === 'Sofía')!.celdas.map((c) => c.nivel)).toEqual(['A', 'C', 'A', 'A', 'C']);
      expect(p.grupo.find((g) => g.habilidad === 'INF')).toEqual({ habilidad: 'INF', promedio: 46.3, distribucion: { C: 2, B: 1, A: 0, AD: 1, descubriendo: 0 }, sinDatos: 1 });
      expect(p.grupo.find((g) => g.habilidad === 'LIT')).toEqual({ habilidad: 'LIT', promedio: null, distribucion: { C: 0, B: 0, A: 0, AD: 0, descubriendo: 0 }, sinDatos: 5 });
      // Mateo (11 días y 0 en C) antes que Sofía (2 en C); Luis se matriculó ayer: aún no.
      expect(p.alertas.map((a) => `${a.alias}:${a.riesgo.motivos.join('+')}`)).toEqual(['Mateo:SIN_ACTIVIDAD', 'Sofía:HABILIDADES_EN_INICIO']);
      expect(p.resumenSemanal).toEqual({
        actual: { semana: '2026-10-19', estudiantesActivos: 1, totalEstudiantes: 5, lecturasFinalizadas: 2, minutosLectura: 14, respuestas: 12 },
        anterior: { semana: '2026-10-12', estudiantesActivos: 0, totalEstudiantes: 5, lecturasFinalizadas: 0, minutosLectura: 0, respuestas: 0 },
        enRiesgo: 2,
      });
      expect(p.estudiantes.find((x) => x.alias === 'Sofía')!.lecturasSemana).toBe(2);
      expect(p.refuerzos).toEqual([{ habilidad: 'INF', estudianteIds: [M(1), M(2)], alias: ['Sofía', 'Teo'], porcentaje: 40, lectura: { id: 'l-killa', titulo: 'Killa y la llama', nivelDificultad: 2 } }]);
    });

    it('sin lectura para la habilidad y edad el refuerzo va sin sugerencia; el catálogo se consulta una vez por edad', async () => {
      e.fichas.lista.splice(0);
      // Tres más sin perfil en IAM con INF y CRI en inicio: INF 5 de 8, CRI 3 de 8.
      for (const n of [7, 8, 9]) e.repo.estudiante(AULA, M(n), { LIT: 70, INF: 20, VOC: 70, CRI: 20, ARG: 70 });
      const p = await e.panel.panel(ROSA, AULA);
      expect(p.refuerzos.map((r) => [r.habilidad, r.lectura, r.alias])).toEqual([
        ['INF', null, ['Estudiante', 'Estudiante', 'Estudiante', 'Sofía', 'Teo']],
        ['CRI', null, ['Estudiante', 'Estudiante', 'Estudiante']],
      ]);
      expect(e.fichas.consultas).toBe(1);
    });

    it('RN-17: el aula de otra docente o que no existe responde 404', async () => {
      await expect(e.panel.panel('otra-docente', AULA)).rejects.toThrow(NoEncontradoError);
      await expect(e.panel.panel(ROSA, 'no-existe')).rejects.toThrow(NoEncontradoError);
    });

    it('un aula sin estudiantes ni refresco aún', async () => {
      e.aulas.aulas.set('vacia', { id: 'vacia', nombre: 'Vacía', grado: '1', estado: 'ARCHIVADA', docenteId: ROSA });
      e.repo.refresco = null;
      const p = await e.panel.panel(ROSA, 'vacia');
      expect(p).toMatchObject({ actualizadoEn: null, totalEstudiantes: 0, estudiantes: [], alertas: [], refuerzos: [] });
    });
  });

  describe('Detalle (RF-064)', () => {
    it('sus habilidades con la tasa sin pista de sus últimas 20 sesiones', async () => {
      e.historial.sesiones.set(M(1), [
        sesion('s-2', [{ esCorrecta: true }, { habilidad: 'LIT', modalidad: 'EVIDENCIA', evidencias: ['Killa vio la espina.'], respuesta: 'Killa vio la espina.' }]),
        sesion('s-1', [{ esCorrecta: true, pistasUsadas: 1, pistas: [{ nivel: 'P1', texto: 'Vuelve a leer.' }] }, { habilidad: 'ARG', modalidad: 'ESCRITURA', esCorrecta: null }]),
      ]);
      const d = await e.detalle.detalle(ROSA, AULA, M(1));
      expect(e.historial.limitePedido).toBe(SESIONES_DETALLE);
      expect(d.estudiante).toEqual({ id: M(1), alias: 'Sofía', avatar: 'unicornio' });
      expect(d.tasaSinPista).toEqual({ cerradas: 3, sinPista: 2, tasa: 67 });
      expect(d.habilidades.map((h) => [h.habilidad, h.nivel, h.tasa.tasa])).toEqual([['LIT', 'A', 100], ['INF', 'C', 50], ['VOC', 'A', null], ['CRI', 'A', null], ['ARG', 'C', null]]);
      expect(d.sesiones.map((s) => [s.id, s.tasa.tasa, s.iniciadaEn])).toEqual([['s-2', 100, '2026-10-20T15:00:00.000Z'], ['s-1', 0, '2026-10-20T15:00:00.000Z']]);
      expect(d.sesiones[1]!.respuestas[0]!.pistas).toEqual([{ nivel: 'P1', texto: 'Vuelve a leer.' }]);
      expect(d.riesgo).toMatchObject({ enRiesgo: true, motivos: ['HABILIDADES_EN_INICIO'] });
      expect(d.ultimaActividad).toBe('2026-10-20T15:00:00.000Z');
    });

    it('RN-17: solo estudiantes matriculados en el aula de la docente', async () => {
      await expect(e.detalle.detalle(ROSA, AULA, 'de-otra-aula')).rejects.toThrow(NoEncontradoError);
      await expect(e.detalle.detalle('otra-docente', AULA, M(1))).rejects.toThrow(NoEncontradoError);
      const sinPerfil = await e.detalle.detalle(ROSA, AULA, M(4));
      expect(sinPerfil).toMatchObject({ tasaSinPista: { tasa: null }, sesiones: [], ultimaActividad: null });
    });
  });

  describe('Reporte (RF-067)', () => {
    it('CSV y PDF con los datos del panel; nombre con el aula y la fecha de Lima', async () => {
      const csv = await e.reporte.reporte(ROSA, AULA, 'csv');
      expect(csv).toMatchObject({ tipo: 'text/csv; charset=utf-8', nombreArchivo: 'reporte-4-a-2026-10-21.csv' });
      expect(new TextDecoder().decode(csv.contenido).split('\r\n')).toHaveLength(7); // cabecera + 5 + final
      const pdf = await e.reporte.reporte(ROSA, AULA, 'pdf');
      expect(pdf).toMatchObject({ tipo: 'application/pdf', nombreArchivo: 'reporte-4-a-2026-10-21.pdf' });
      expect(e.pdf.ultimo).toMatchObject({ aula: { nombre: '4.° A' }, enRiesgo: 2, resumen: { semana: '2026-10-19' } });
      expect(e.pdf.ultimo!.filas.map((f) => f.alias)).toEqual(['Ana', 'Luis', 'Mateo', 'Sofía', 'Teo']);
    });

    it('formato desconocido 400; aula ajena 404', async () => {
      await expect(e.reporte.reporte(ROSA, AULA, 'xls')).rejects.toThrow(ErrorDeNegocio);
      await expect(e.reporte.reporte('otra-docente', AULA, 'csv')).rejects.toThrow(NoEncontradoError);
    });
  });

  describe('Resumen semanal (RF-065)', () => {
    it('una vez por docente y semana, con cada aula, sus alertas y refuerzos', async () => {
      e.repo.aulas.push({ aulaId: AULA, docenteId: ROSA, nombre: '4.° A', estudiantes: 5 }, { aulaId: 'aula-otra', docenteId: 'docente-elena', nombre: '3.° B', estudiantes: 1 });
      e.aulas.aulas.set('aula-otra', { id: 'aula-otra', nombre: '3.° B', grado: '3', estado: 'ACTIVA', docenteId: 'docente-elena' });
      expect(await e.resumen.enviarPendientes()).toBe(2);
      expect(await e.resumen.enviarPendientes()).toBe(0);
      const deRosa = e.correo.enviados.find((c) => c.docenteId === ROSA)!;
      expect(deRosa.asunto).toBe('Resumen semanal de tus aulas (semana del 12 de octubre)');
      expect(deRosa.enlace).toBe('https://lectoaventura.pe/docente');
      expect(deRosa.texto).toContain('4.° A: 0 de 5 estudiantes leyeron; 0 lecturas terminadas (0 min).');
      expect(deRosa.texto).toContain('Para acompañar (2): Mateo, Sofía.');
      expect(deRosa.texto).toContain('Refuerzo grupal sugerido: inferencias (40 % del aula en inicio).');
    });

    it('el lunes antes de las 07:00 de Lima no envía; si el correo no sale, no cuenta', async () => {
      e.repo.aulas.push({ aulaId: AULA, docenteId: ROSA, nombre: '4.° A', estudiantes: 5 });
      e.reloj.actual = new Date('2026-10-19T11:00:00Z');
      expect(await e.resumen.enviarPendientes()).toBe(0);
      e.reloj.actual = new Date('2026-10-26T13:00:00Z');
      e.correo.activo = false;
      expect(await e.resumen.enviarPendientes()).toBe(0);
      expect(e.repo.resumenes.has(`${ROSA}:2026-10-19`)).toBe(true); // se registró: no se reintenta en bucle
    });

    it('si el correo de una docente falla, las demás lo reciben y el suyo se reintenta en el próximo ciclo', async () => {
      e.repo.aulas.push({ aulaId: AULA, docenteId: ROSA, nombre: '4.° A', estudiantes: 5 }, { aulaId: 'aula-otra', docenteId: 'docente-elena', nombre: '3.° B', estudiantes: 1 });
      e.aulas.aulas.set('aula-otra', { id: 'aula-otra', nombre: '3.° B', grado: '3', estado: 'ACTIVA', docenteId: 'docente-elena' });
      e.correo.fallaPara.add(ROSA);
      await expect(e.resumen.enviarPendientes()).rejects.toThrow('No salió el resumen semanal de 1 docente(s); se reintentará');
      expect(e.correo.enviados.map((c) => c.docenteId)).toEqual(['docente-elena']);
      expect(e.repo.resumenes.has(`${ROSA}:2026-10-12`)).toBe(false);
      e.correo.fallaPara.clear();
      expect(await e.resumen.enviarPendientes()).toBe(1);
      expect(e.correo.enviados.map((c) => c.docenteId)).toEqual(['docente-elena', ROSA]);
    });

    it('omite un aula que ya no existe en Escuela', async () => {
      e.repo.aulas.push({ aulaId: 'borrada', docenteId: ROSA, nombre: 'Borrada', estudiantes: 1 });
      expect(await e.resumen.enviarPendientes()).toBe(1);
      expect(e.correo.enviados[0]!.texto).not.toContain('Borrada');
    });
  });
});
