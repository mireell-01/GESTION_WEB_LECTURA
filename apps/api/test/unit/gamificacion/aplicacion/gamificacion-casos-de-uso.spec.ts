import { beforeEach, describe, expect, it } from 'vitest';

import { MonedasInsuficientesError, RecompensaYaCanjeadaError } from '../../../../src/modules/gamificacion/domain/errors/errores-gamificacion';
import { idDeterminista } from '../../../../src/modules/gamificacion/domain/services/id-origen';
import { DatosItemRespondido, NoEncontradoError } from '../../../../src/modules/shared-kernel/public-api';
import { crearEntornoGamificacion, EntornoGamificacion } from '../dobles';

/** Nivel 1 — Casos de uso de Gamificación con dobles (RF-056 a RF-062, RN-10 a RN-13, RN-18, RN-19). */
const NINO = 'nino-9';
const HOY = '2026-10-21';

const item = (p: Partial<DatosItemRespondido> = {}): DatosItemRespondido => ({
  estudianteId: NINO,
  respuestaId: 'r-1',
  sesionId: 's-1',
  lecturaId: 'l-1',
  itemId: 'i-1',
  habilidad: 'INF',
  nivelDificultad: 3,
  esCorrecta: true,
  pistasUsadas: 0,
  puntajeItem: 1,
  esRepeticion: false,
  palabras: null,
  modalidad: 'SELECCION',
  ...p,
});

describe('Gamificación: logros, pasaporte, reto del día y recompensas', () => {
  let e: EntornoGamificacion;

  beforeEach(() => {
    e = crearEntornoGamificacion();
    e.identidad.perfiles.set(NINO, { alias: 'Mateo', avatar: 'zorro', rangoEdad: 'R2' });
    e.maestria.valores.set(NINO, { LIT: 80, INF: 20, VOC: 60, CRI: 40, ARG: 30 });
  });

  describe('Puntos por lo que el niño logra (RF-056, RN-11)', () => {
    it('acierto, corrección tras pista y abierta con esfuerzo; el error no suma ni resta (RN-10)', async () => {
      await e.logros.alItem(item({ respuestaId: 'r-1', pistasUsadas: 1 }));
      await e.logros.alItem(item({ respuestaId: 'r-2', habilidad: 'LIT', modalidad: 'EVIDENCIA' }));
      await e.logros.alItem(item({ respuestaId: 'r-3', esCorrecta: false, pistasUsadas: 3 }));
      await e.logros.alItem(item({ respuestaId: 'r-4', habilidad: 'ARG', esCorrecta: null, puntajeItem: null, palabras: 6, modalidad: 'ESCRITURA' }));
      expect(e.repo.motivos(NINO)).toEqual(['CORRECTO_TRAS_PISTA:6', 'ITEM_CORRECTO:10', 'RESPUESTA_ABIERTA:10']);
      expect(e.repo.aplicados.has('ITEM:r-3')).toBe(false);
    });

    it('RN-19: en R3 la abierta pide 10 palabras; sin el esfuerzo no hay puntos', async () => {
      e.identidad.perfiles.set(NINO, { alias: 'Mateo', avatar: 'zorro', rangoEdad: 'R3' });
      await e.logros.alItem(item({ respuestaId: 'r-1', esCorrecta: null, puntajeItem: null, palabras: 8 }));
      await e.logros.alItem(item({ respuestaId: 'r-2', esCorrecta: null, puntajeItem: null, palabras: 12 }));
      expect(e.repo.motivos(NINO)).toEqual(['RESPUESTA_ABIERTA:10']);
    });

    it('un evento reentregado no suma dos veces', async () => {
      await e.logros.alItem(item());
      await e.logros.alItem(item());
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1' });
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1' });
      expect(e.repo.motivos(NINO)).toEqual(['ITEM_CORRECTO:10', 'LECTURA_COMPLETADA:20']);
    });

    it('terminar una lectura: +20, primer día de racha y "Primera lectura"; sin sesión no hace nada', async () => {
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1' });
      expect(e.repo.asientos).toHaveLength(0);
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1' });
      expect(e.repo.motivos(NINO)).toEqual(['LECTURA_COMPLETADA:20']);
      expect(e.repo.rachas.get(NINO)).toMatchObject({ dias: 1, ultimaFecha: HOY });
      expect([...(e.repo.ganadas.get(NINO)?.keys() ?? [])]).toEqual(['i-primera']);
      expect(e.bus.nombres()).toEqual(['gamificacion.InsigniaOtorgada']);
    });

    it('RN-12: repetir da el 25 % y no cuenta para las insignias de lecturas ni de evidencias', async () => {
      await e.logros.alItem(item({ esRepeticion: true, modalidad: 'EVIDENCIA' }));
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1', esRepeticion: true });
      expect(e.repo.motivos(NINO)).toEqual(['ITEM_CORRECTO:3', 'LECTURA_COMPLETADA:5']);
      expect(e.repo.avances.get(NINO)?.size ?? 0).toBe(0);
      expect(e.repo.rachas.get(NINO)?.dias).toBe(1); // repetir también es leer
    });

    it('RN-11: +50 la primera vez que una habilidad llega a un nivel CNEB', async () => {
      const subida = { estudianteId: NINO, habilidad: 'INF', nivelAnterior: 'B', nivelNuevo: 'A' };
      await e.logros.alNivelSubido(subida);
      await e.logros.alNivelSubido(subida);
      await e.logros.alNivelSubido({ ...subida, habilidad: 'XYZ' });
      expect(e.repo.motivos(NINO)).toEqual(['SUBIDA_NIVEL_CNEB:50']);
      expect(e.repo.asientos[0]!.origenId).toBe(idDeterminista('nivel', NINO, 'INF', 'A'));
    });
  });

  describe('Insignias por eventos (RF-058)', () => {
    it('"Maestro de las Inferencias" con el nivel Destacado declarado (RN-08: ≥ 5 ítems)', async () => {
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'INF', valorNuevo: 90, itemsContados: 4 });
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'INF', valorNuevo: 70, itemsContados: 9 });
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'LIT', valorNuevo: 95, itemsContados: 9 }); // sin regla para LIT
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'INF' });
      expect(e.repo.ganadas.get(NINO)).toBeUndefined();
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'INF', valorNuevo: 88, itemsContados: 6 });
      await e.logros.alMaestria({ estudianteId: NINO, habilidad: 'INF', valorNuevo: 91, itemsContados: 7 });
      expect([...(e.repo.ganadas.get(NINO)?.keys() ?? [])]).toEqual(['i-maestro']);
    });

    it('completar el mundo Detective otorga su rango; un dato inválido se ignora', async () => {
      await e.logros.alMundo({ estudianteId: NINO, mundoCompletado: Number.NaN });
      await e.logros.alMundo({ estudianteId: NINO, mundoCompletado: 2 });
      await e.logros.alMundo({ estudianteId: NINO, mundoCompletado: 2 });
      expect([...(e.repo.ganadas.get(NINO)?.keys() ?? [])]).toEqual(['i-detective-rango']);
      expect(e.bus.nombres()).toEqual(['gamificacion.InsigniaOtorgada']);
    });
  });

  describe('Reto del día (RF-060, RN-18)', () => {
    beforeEach(() => {
      e.fichas.lista.push(
        { id: 'l-dificil', titulo: 'El cóndor', rangoEdad: 'R2', nivelDificultad: 3, tematica: 'Aves', habilidadesObjetivo: ['INF'] },
        { id: 'l-leida', titulo: 'Ya la leyó', rangoEdad: 'R2', nivelDificultad: 1, tematica: 'Aves', habilidadesObjetivo: ['INF'] },
        { id: 'l-facil', titulo: 'Pistas en el bosque', rangoEdad: 'R2', nivelDificultad: 1, tematica: 'Bosque', habilidadesObjetivo: ['INF', 'LIT'] },
        { id: 'l-otra', titulo: 'Solo literal', rangoEdad: 'R2', nivelDificultad: 1, tematica: 'Mar', habilidadesObjetivo: ['LIT'] },
        { id: 'l-r3', titulo: 'Para grandes', rangoEdad: 'R3', nivelDificultad: 1, tematica: 'Mar', habilidadesObjetivo: ['INF'] },
      );
      e.avance.estados.set('l-leida', 'FINALIZADA');
    });

    it('uno por día, para la habilidad más débil, con la lectura más sencilla aún no terminada', async () => {
      const a = await e.pasaporte.retoDelDia(NINO);
      const b = await e.pasaporte.retoDelDia(NINO);
      expect(a).toEqual(b);
      expect(a).toEqual({ id: 'id-1', fecha: HOY, habilidad: 'INF', meta: 3, avance: 0, estado: 'PROPUESTO', minutos: 5, puntos: 15, completadoEn: null, lectura: { id: 'l-facil', titulo: 'Pistas en el bosque' } });
    });

    it('sin lectura que trabaje esa habilidad, el reto va sin sugerencia; sin perfil activo responde 404', async () => {
      e.maestria.valores.set(NINO, { LIT: 0, INF: 90, VOC: 90, CRI: 90, ARG: 90 });
      e.fichas.lista.splice(0);
      expect((await e.pasaporte.retoDelDia(NINO)).lectura).toBeNull();
      await expect(e.pasaporte.retoDelDia('otro')).rejects.toThrow(NoEncontradoError);
      expect(await e.logros.retoDeHoy('otro', HOY)).toMatchObject({ datos: { habilidad: 'LIT', lectura: null } });
    });

    it('tres aciertos de esa habilidad lo completan: +15, racha y evento', async () => {
      for (const id of ['r-1', 'r-2']) await e.logros.alItem(item({ respuestaId: id }));
      await e.logros.alItem(item({ respuestaId: 'r-x', habilidad: 'LIT' }));
      expect((await e.pasaporte.retoDelDia(NINO)).avance).toBe(2);
      await e.logros.alItem(item({ respuestaId: 'r-3', pistasUsadas: 1 }));
      expect(await e.pasaporte.retoDelDia(NINO)).toMatchObject({ avance: 3, estado: 'COMPLETADO', completadoEn: '2026-10-21T15:00:00.000Z' });
      expect(e.repo.motivos(NINO)).toEqual(['ITEM_CORRECTO:10', 'ITEM_CORRECTO:10', 'ITEM_CORRECTO:10', 'CORRECTO_TRAS_PISTA:6', 'RETO_DEL_DIA:15']);
      expect(e.repo.rachas.get(NINO)?.dias).toBe(1);
      expect(e.bus.nombres()).toContain('gamificacion.RetoDelDiaCompletado');
    });
  });

  describe('Pasaporte del Lector (RF-059)', () => {
    it('reúne puntos, nivel, monedas, racha, insignias con su avance, mundos y lecturas', async () => {
      e.fichas.lista.push({ id: 'l-1', titulo: 'Killa y la llama', rangoEdad: 'R2', nivelDificultad: 2, tematica: 'Animales' });
      e.lecturas.lista.push({ lecturaId: 'l-1', finalizadaEn: new Date('2026-10-21T14:00:00Z') }, { lecturaId: 'l-archivada', finalizadaEn: new Date('2026-10-20T14:00:00Z') });
      e.mundos.lista.push({ numero: 1, nombre: 'Explorador', completadoEn: null });
      await e.logros.alItem(item({ respuestaId: 'r-1', modalidad: 'EVIDENCIA', habilidad: 'LIT' }));
      await e.logros.alLecturaFinalizada({ estudianteId: NINO, lecturaId: 'l-1', sesionId: 's-1' });
      await e.logros.alNivelSubido({ estudianteId: NINO, habilidad: 'LIT', nivelAnterior: 'A', nivelNuevo: 'AD' });
      e.repo.rachas.set(NINO, { dias: 3, mejor: 5, ultimaFecha: HOY, comodinSemana: '2026-10-19' });

      const v = await e.pasaporte.pasaporte(NINO);
      expect(v).toMatchObject({
        alias: 'Mateo',
        avatar: 'zorro',
        puntos: { total: 80, hoy: 80, topeDiario: 300 },
        nivel: { actual: 0, desde: 0, hasta: 100, faltan: 20 },
        monedas: 8,
        racha: { dias: 3, mejor: 5, leyoHoy: true, comodinDisponible: false },
        mundos: [{ numero: 1, nombre: 'Explorador', completadoEn: null }],
        lecturas: { total: 2, recientes: [{ id: 'l-1', titulo: 'Killa y la llama', finalizadaEn: '2026-10-21T14:00:00.000Z' }] },
      });
      expect(v.insignias.map((i) => [i.codigo, i.ganada, i.avance, i.meta])).toEqual([
        ['PRIMERA_LECTURA', true, 1, 1],
        ['DETECTIVE_EVIDENCIAS', false, 1, 5],
        ['MAESTRO_INFERENCIAS', false, null, null],
        ['LECTOR_PERSEVERANTE', false, 3, 7],
        ['RANGO_DETECTIVE', false, null, null],
      ]);
      expect(v.ultimosPuntos.map((u) => u.motivo)).toEqual(['SUBIDA_NIVEL_CNEB', 'LECTURA_COMPLETADA', 'ITEM_CORRECTO']);
      expect(v.recompensas).toEqual([
        { id: 'r-lupa', codigo: 'LUPA', nombre: 'Lupa de detective', tipo: 'ACCESORIO', costo: 5, tuya: false },
        { id: 'r-llama', codigo: 'LLAMA', nombre: 'Llama', tipo: 'PERSONAJE', costo: 20, tuya: false },
      ]);
    });

    it('sin perfil activo responde 404', async () => {
      await expect(e.pasaporte.pasaporte('otro')).rejects.toThrow(NoEncontradoError);
    });
  });

  describe('Recompensas (RF-062)', () => {
    it('canjea con monedas, publica el canje y no toca los puntos', async () => {
      for (let i = 0; i < 6; i++) await e.logros.alItem(item({ respuestaId: `r-${i}`, habilidad: 'LIT' })); // 60 puntos = 6 monedas
      expect(await e.pasaporte.canjear(NINO, 'r-lupa')).toEqual({ recompensa: 'LUPA', monedas: 1 });
      expect(e.bus.publicados.at(-1)).toMatchObject({ nombreEvento: 'gamificacion.RecompensaCanjeada', datos: { estudianteId: NINO, recompensa: 'LUPA', monedas: 5 } });
      expect((await e.pasaporte.pasaporte(NINO)).puntos.total).toBe(60);
      await expect(e.pasaporte.canjear(NINO, 'r-lupa')).rejects.toThrow(RecompensaYaCanjeadaError);
      await expect(e.pasaporte.canjear(NINO, 'r-llama')).rejects.toThrow(MonedasInsuficientesError);
      await expect(e.pasaporte.canjear(NINO, 'no-existe')).rejects.toThrow(NoEncontradoError);
    });
  });
});
