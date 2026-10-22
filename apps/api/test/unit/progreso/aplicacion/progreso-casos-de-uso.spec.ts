import { beforeEach, describe, expect, it } from 'vitest';

import { MaestriaDesactualizadaError } from '../../../../src/modules/progreso/domain/errors/errores-progreso';
import { DatosItemRespondido, EVENTOS_INTEGRACION, NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoProgreso, EntornoProgreso } from '../dobles';

/** Nivel 1 — Casos de uso de Progreso con dobles (RF-052 a RF-055, RN-07, RN-19, RN-20). */
const NINO = 'nino-9';
const TRES = { LIT: 3, INF: 3, VOC: 3, CRI: 3, ARG: 3 };

const item = (p: Partial<DatosItemRespondido> = {}): DatosItemRespondido => ({
  estudianteId: NINO,
  respuestaId: 'r-1',
  sesionId: 's-1',
  lecturaId: 'l-1',
  itemId: 'i-1',
  habilidad: 'INF',
  nivelDificultad: 3,
  esCorrecta: true,
  pistasUsadas: 1,
  puntajeItem: 0.75,
  esRepeticion: false,
  palabras: null,
  ...p,
});

describe('Progreso: perfil lector, maestría y recomendaciones', () => {
  let e: EntornoProgreso;

  beforeEach(() => {
    e = crearEntornoProgreso();
    e.identidad.rangos.set(NINO, 'R2');
  });

  describe('Maestría (RF-053)', () => {
    it('el reto inicial crea el perfil una sola vez; la reevaluación no lo toca', async () => {
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', tipo: 'INICIAL', maestrias: { LIT: 80, INF: 40, VOC: 66, CRI: 20, ARG: 0 }, items: TRES });
      expect(e.repo.filas.get(NINO)?.map((m) => [m.habilidad, m.valor, m.itemsContados])).toEqual([['LIT', 80, 3], ['INF', 40, 3], ['VOC', 66, 3], ['CRI', 20, 3], ['ARG', 0, 3]]);
      expect(e.bus.nombres()).toEqual(['progreso.PerfilLectorIniciado']);
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', tipo: 'INICIAL', maestrias: { LIT: 0 }, items: TRES });
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-2', tipo: 'REEVALUACION', maestrias: { LIT: 0 }, items: TRES });
      expect(e.repo.filas.get(NINO)?.[0]?.valor).toBe(80);
      expect(e.repo.historial).toHaveLength(5);
    });

    it('cada ítem cerrado mueve su habilidad (EMA) y avisa a Aventura; reintentar el evento no cuenta doble', async () => {
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', maestrias: { INF: 40 }, items: TRES });
      e.bus.publicados.length = 0;
      await e.perfil.alItem(item());
      // 0,75 × 1,1 × 100 = 82,5 · 0,3 × 82,5 + 0,7 × 40 = 52,75
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'INF')).toMatchObject({ valor: 52.75, itemsContados: 4, version: 2 });
      expect(e.bus.publicados[0]).toMatchObject({ nombreEvento: EVENTOS_INTEGRACION.MAESTRIA_ACTUALIZADA, datos: { estudianteId: NINO, habilidad: 'INF', valorAnterior: 40, valorNuevo: 52.75, itemsContados: 4 } });
      await e.perfil.alItem(item());
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'INF')?.itemsContados).toBe(4);
    });

    it('las respuestas abiertas sin valorar no cuentan; la valoración docente sí (RN-19)', async () => {
      await e.perfil.alItem(item({ habilidad: 'ARG', puntajeItem: null, esCorrecta: null }));
      await e.perfil.alItem(item({ habilidad: 'XYZ' }));
      expect(e.repo.filas.size).toBe(0);
      await e.perfil.alValoracion({ estudianteId: NINO, respuestaId: 'r-9', itemId: 'i-9', habilidad: 'ARG', nivelDificultad: 2, nivel: 3, puntajeItem: 1 });
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'ARG')).toMatchObject({ valor: 100, itemsContados: 1 });
      expect(e.repo.historial.at(-1)).toMatchObject({ origen: 'VALORACION', origenId: 'r-9' });
      await e.perfil.alValoracion({ estudianteId: NINO, respuestaId: 'r-9', itemId: 'i-9', habilidad: 'ARG', nivelDificultad: 2, nivel: 3, puntajeItem: 1 });
      await e.perfil.alValoracion({ estudianteId: NINO, respuestaId: 'r-10', itemId: 'i-9', habilidad: 'OTRA', nivelDificultad: 2, nivel: 3, puntajeItem: 1 });
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'ARG')?.itemsContados).toBe(1);
    });

    it('sin perfil guardado, parte del reto inicial que ya hizo (niños de antes del Módulo 7)', async () => {
      e.diagnostico.resultados.set(NINO, { estado: 'FINALIZADO', maestrias: { INF: 40 }, items: TRES, diagnosticoId: 'd-viejo' });
      await e.perfil.alItem(item());
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'INF')).toMatchObject({ valor: 52.75, itemsContados: 4 });
      expect(e.repo.historial.filter((h) => h.origen === 'DIAGNOSTICO')).toHaveLength(5);
    });

    it('RN-11: avisa cuando sube el nivel CNEB declarado de una habilidad', async () => {
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', maestrias: { INF: 60 }, items: { INF: 5 } });
      await e.perfil.alItem(item({ puntajeItem: 1, nivelDificultad: 5 })); // 0,3 × 100 + 0,7 × 60 = 72: de B a A
      expect(e.bus.publicados.find((x) => x.nombreEvento === EVENTOS_INTEGRACION.MAESTRIA_NIVEL_SUBIDO)).toMatchObject({ datos: { habilidad: 'INF', nivelAnterior: 'B', nivelNuevo: 'A' } });
    });

    it('si otro guardado llega primero se vuelve a calcular (bloqueo optimista); tras 3 intentos se rinde', async () => {
      await Promise.all([e.perfil.alItem(item({ respuestaId: 'a' })), e.perfil.alItem(item({ respuestaId: 'b' }))]);
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'INF')?.itemsContados).toBe(2);
      e.repo.conflictosPendientes = 1;
      await e.perfil.alItem(item({ respuestaId: 'c' }));
      expect(e.repo.filas.get(NINO)?.find((m) => m.habilidad === 'INF')?.itemsContados).toBe(3);
      e.repo.conflictosPendientes = 3;
      await expect(e.perfil.alItem(item({ respuestaId: 'd' }))).rejects.toBeInstanceOf(MaestriaDesactualizadaError);
    });
  });

  describe('Para Aventura y la biblioteca', () => {
    it('la maestría es la del perfil, o la del reto inicial, o ninguna', async () => {
      expect(await e.perfil.maestriasDe(NINO)).toBeNull();
      e.diagnostico.resultados.set(NINO, { estado: 'FINALIZADO', maestrias: { LIT: 70 } });
      expect(await e.perfil.maestriasDe(NINO)).toEqual({ LIT: 70 });
      await e.perfil.alItem(item({ habilidad: 'LIT', puntajeItem: 1, nivelDificultad: 2 }));
      expect((await e.perfil.maestriasDe(NINO))?.LIT).toBe(79);
    });

    it('el nivel de lectura sale de la maestría promedio y su edad; sin datos, ninguno', async () => {
      expect(await e.perfil.nivelDe(NINO)).toBeNull();
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', maestrias: { LIT: 90, INF: 90, VOC: 90, CRI: 90, ARG: 90 }, items: TRES });
      expect(await e.perfil.nivelDe(NINO)).toBe(4);
      e.identidad.rangos.delete(NINO);
      expect(await e.perfil.nivelDe(NINO)).toBeNull();
    });
  });

  describe('Perfil lector (RF-052, RF-054)', () => {
    it('muestra las 5 habilidades con su etiqueta, "Aún descubriendo" con menos de 5 ítems, y las que hay que reforzar', async () => {
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', maestrias: { LIT: 88, INF: 30, VOC: 50.4, CRI: 70, ARG: 10 }, items: { LIT: 5, INF: 6, VOC: 5, CRI: 5, ARG: 2 } });
      const v = await e.perfil.perfil(NINO);
      expect(v.habilidades.map((h) => [h.codigo, h.valor, h.etiqueta, h.aReforzar])).toEqual([
        ['LIT', 88, 'Destacado', false],
        ['INF', 30, 'En inicio', true],
        ['VOC', 50, 'En proceso', false],
        ['CRI', 70, 'Logrado', false],
        ['ARG', 10, 'Aún descubriendo', false],
      ]);
      expect(v).toMatchObject({ conDatos: true, nivelLectura: 2, actualizadoEn: e.reloj.actual.toISOString() });
    });

    it('un niño sin reto todavía ve todo por descubrir; el de otro rango o inexistente no existe', async () => {
      const v = await e.perfil.perfil(NINO);
      expect(v).toMatchObject({ conDatos: false, nivelLectura: null, actualizadoEn: null });
      expect(v.habilidades.every((h) => h.etiqueta === 'Aún descubriendo' && h.valor === 0)).toBe(true);
      await expect(e.perfil.perfil('nadie')).rejects.toBeInstanceOf(NoEncontradoError);
    });

    it('al abrir el perfil por primera vez se guarda el que parte del reto inicial', async () => {
      e.diagnostico.resultados.set(NINO, { estado: 'FINALIZADO', maestrias: { LIT: 70 }, items: TRES, diagnosticoId: 'd-1' });
      await e.perfil.perfil(NINO);
      expect(e.repo.filas.get(NINO)?.[0]).toMatchObject({ habilidad: 'LIT', valor: 70 });
      await e.perfil.perfil(NINO);
      expect(e.repo.historial).toHaveLength(5);
    });
  });

  describe('Recomendaciones (RF-055, RN-20)', () => {
    beforeEach(async () => {
      await e.perfil.alDiagnostico({ estudianteId: NINO, diagnosticoId: 'd-1', maestrias: { LIT: 70, INF: 30, VOC: 60, CRI: 50, ARG: 50 }, items: TRES });
      e.fichas.publicar('inf-2', { habilidades: ['INF'], nivelDificultad: 2 });
      e.fichas.publicar('inf-5', { habilidades: ['INF'], nivelDificultad: 5 });
      e.fichas.publicar('lit-2', { habilidades: ['LIT'], nivelDificultad: 2 });
      e.fichas.publicar('de-mision', { habilidades: ['LIT'], nivelDificultad: 2 });
      e.fichas.publicar('r3', { rangoEdad: 'R3', habilidades: ['ARG'], nivelDificultad: 3 });
    });

    it('asignación, misión en curso y habilidad más débil, con sus títulos; se guardan como vigentes', async () => {
      e.asignaciones.lista.push({ estudianteId: NINO, asignacionId: 'a-1', tipo: 'LECTURA', contenidoId: 'r3', titulo: 'Lectura r3' });
      e.mision.porEstudiante.set(NINO, { misionId: 'm-1', mision: 'Pistas del bosque', lecturaId: 'de-mision', enCurso: true });
      e.avance.marcar(NINO, 'de-mision', 'EN_CURSO');
      const r = await e.recomendaciones.recomendaciones(NINO);
      expect(r).toEqual([
        { tipo: 'ASIGNACION_DOCENTE', prioridad: 1, lectura: { id: 'r3', titulo: 'Lectura r3', nivelDificultad: 3 }, habilidad: null, mision: null, asignacionId: 'a-1', enCurso: false },
        { tipo: 'LECTURA_MISION', prioridad: 2, lectura: { id: 'de-mision', titulo: 'Lectura de-mision', nivelDificultad: 2 }, habilidad: null, mision: { id: 'm-1', titulo: 'Pistas del bosque' }, asignacionId: null, enCurso: true },
        { tipo: 'LECTURA_HABILIDAD_DEBIL', prioridad: 3, lectura: { id: 'inf-2', titulo: 'Lectura inf-2', nivelDificultad: 2 }, habilidad: 'INF', mision: null, asignacionId: null, enCurso: false },
      ]);
      expect(await e.recomendacionesRepo.vigentes(NINO)).toHaveLength(3);
      await e.recomendaciones.recomendaciones(NINO);
      expect(e.recomendacionesRepo.reemplazos).toBe(1); // iguales: no se reescriben
    });

    it('al terminar la recomendada, la siguiente vez cambia (y se reemplazan las vigentes)', async () => {
      expect((await e.recomendaciones.recomendaciones(NINO)).map((x) => x.lectura?.id)).toEqual(['inf-2']);
      e.avance.marcar(NINO, 'inf-2', 'FINALIZADA');
      expect((await e.recomendaciones.recomendaciones(NINO)).map((x) => x.lectura?.id)).toEqual(['inf-5']);
      expect(e.recomendacionesRepo.reemplazos).toBe(2);
      expect(e.recomendacionesRepo.guardadas.filter((g) => g.vigente)).toHaveLength(1);
    });

    it('sin nada pendiente de su habilidad débil, refuerzo; sin lecturas de su edad, ninguna; estudiante inexistente, 404', async () => {
      for (const id of ['inf-2', 'inf-5']) e.avance.marcar(NINO, id, 'FINALIZADA');
      expect(await e.recomendaciones.recomendaciones(NINO)).toEqual([expect.objectContaining({ tipo: 'REFUERZO', lectura: expect.objectContaining({ id: 'lit-2' }) })]);
      e.fichas.lista.length = 0;
      expect(await e.recomendaciones.recomendaciones(NINO)).toEqual([]);
      await expect(e.recomendaciones.recomendaciones('nadie')).rejects.toBeInstanceOf(NoEncontradoError);
    });

    it('una asignación cuya lectura ya no está publicada no se muestra', async () => {
      e.asignaciones.lista.push({ estudianteId: NINO, asignacionId: 'a-1', tipo: 'LECTURA', contenidoId: 'archivada', titulo: 'Archivada' });
      expect((await e.recomendaciones.recomendaciones(NINO)).map((x) => x.tipo)).toEqual(['LECTURA_HABILIDAD_DEBIL']);
    });
  });
});
