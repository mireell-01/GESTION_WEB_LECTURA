import { describe, expect, it } from 'vitest';

import { nivelSubio, PerfilLector } from '../../../../src/modules/progreso/domain/entities/perfil-lector';
import { aReforzar, factorDificultad, nivelLectura, puntajeObservado, siguienteMaestria } from '../../../../src/modules/progreso/domain/services/maestria';
import { CandidatosRecomendacion, recomendar } from '../../../../src/modules/progreso/domain/services/recomendador';

/** Nivel 1 — Dominio del perfil lector (RF-052 a RF-055, RN-07, RN-08, RN-20). */
const AHORA = new Date('2026-10-22T15:00:00Z');

describe('Maestría (RN-07) y refuerzo (RF-054)', () => {
  it('el ítem vale su puntaje × (0,8 + 0,1 × dificultad) × 100, acotado a 100', () => {
    expect(factorDificultad(3)).toBeCloseTo(1.1);
    expect(puntajeObservado(1, 1)).toBeCloseTo(90);
    expect(puntajeObservado(0.75, 3)).toBeCloseTo(82.5);
    expect(puntajeObservado(1, 5)).toBe(100);
    expect(puntajeObservado(0, 4)).toBe(0);
  });

  it('EMA α = 0,3; el primer ítem de una habilidad sin historia toma su valor', () => {
    expect(siguienteMaestria(0, 0, 82.5)).toBe(82.5);
    expect(siguienteMaestria(70, 0, 100)).toBe(79); // con valor del reto inicial, aunque no traiga ítems
    expect(siguienteMaestria(50, 3, 100)).toBe(65);
    expect(siguienteMaestria(70, 6, 0)).toBe(49);
    expect(siguienteMaestria(33.333, 2, 33.333)).toBe(33.33);
  });

  it('"a reforzar" con maestría menor a 40 y al menos 5 ítems', () => {
    expect(aReforzar(39.9, 5)).toBe(true);
    expect(aReforzar(39.9, 4)).toBe(false);
    expect(aReforzar(40, 9)).toBe(false);
  });

  it('nivel de lectura: el de su edad, −1 en inicio, +1 logrado, +2 destacado, entre 1 y 5', () => {
    expect([nivelLectura('R2', 50), nivelLectura('R2', 30), nivelLectura('R2', 70), nivelLectura('R2', 90)]).toEqual([2, 1, 3, 4]);
    expect(nivelLectura('R1', 10)).toBe(1);
    expect(nivelLectura('R3', 95)).toBe(5);
  });
});

describe('PerfilLector (RF-052, RF-053)', () => {
  it('nace con las 5 habilidades en 0 y parte del reto inicial una sola vez', () => {
    const p = PerfilLector.nuevo('nino');
    expect(p.todas().map((m) => [m.habilidad, m.valor, m.itemsContados])).toEqual([['LIT', 0, 0], ['INF', 0, 0], ['VOC', 0, 0], ['CRI', 0, 0], ['ARG', 0, 0]]);
    expect(p.tieneHistoria).toBe(false);
    expect(p.iniciarConDiagnostico({ maestrias: { LIT: 110, INF: 45.556, VOC: 70 }, items: { LIT: 3, INF: 3, VOC: 3, CRI: 3, ARG: 3 }, diagnosticoId: 'd1', ahora: AHORA })).toBe(true);
    expect(p.valores()).toEqual({ LIT: 100, INF: 45.56, VOC: 70, CRI: 0, ARG: 0 });
    expect(p.cambios()).toHaveLength(5);
    expect(p.cambios()[0]).toMatchObject({ origen: 'DIAGNOSTICO', origenId: 'd1', nivelAnterior: null, nivelNuevo: null });
    expect(p.iniciarConDiagnostico({ maestrias: { LIT: 0 }, items: { LIT: 3 }, diagnosticoId: 'd2', ahora: AHORA })).toBe(false);
  });

  it('cada ítem mueve su habilidad (EMA) y cuenta un ítem más; el nivel se declara con 5 (RN-08)', () => {
    const p = PerfilLector.desdePersistencia('nino', [{ habilidad: 'INF', valor: 60, itemsContados: 4, actualizadoEn: AHORA, version: 2 }]);
    expect(p.estaPersistido).toBe(true);
    const c = p.registrar({ habilidad: 'INF', puntajeItem: 1, nivelDificultad: 3, origen: 'ITEM', origenId: 'r1', ahora: AHORA });
    expect(c).toMatchObject({ habilidad: 'INF', anterior: 60, nuevo: 72, itemsContados: 5, nivelAnterior: null, nivelNuevo: 'A' });
    expect(nivelSubio(c)).toBe(false); // declararse por primera vez no es "subir"
    const d = p.registrar({ habilidad: 'INF', puntajeItem: 1, nivelDificultad: 5, origen: 'ITEM', origenId: 'r2', ahora: AHORA });
    expect(d).toMatchObject({ nuevo: 80.4, nivelAnterior: 'A', nivelNuevo: 'A' });
    const e = p.registrar({ habilidad: 'INF', puntajeItem: 1, nivelDificultad: 5, origen: 'ITEM', origenId: 'r3', ahora: AHORA });
    expect(e).toMatchObject({ nuevo: 86.28, nivelNuevo: 'AD' });
    expect(nivelSubio(e)).toBe(true);
    expect(p.habilidadesCambiadas()).toEqual(['INF']);
    p.confirmarCambios();
    expect(p.de('INF').version).toBe(3);
    expect(p.cambios()).toEqual([]);
  });

  it('RF-054 y RN-20: las que hay que reforzar y la más débil (a igualdad, la menos practicada)', () => {
    const p = PerfilLector.desdePersistencia('nino', [
      { habilidad: 'LIT', valor: 80, itemsContados: 9, actualizadoEn: AHORA, version: 1 },
      { habilidad: 'INF', valor: 30, itemsContados: 6, actualizadoEn: AHORA, version: 1 },
      { habilidad: 'VOC', valor: 30, itemsContados: 2, actualizadoEn: AHORA, version: 1 },
      { habilidad: 'CRI', valor: 55, itemsContados: 5, actualizadoEn: AHORA, version: 1 },
      { habilidad: 'ARG', valor: 45, itemsContados: 5, actualizadoEn: AHORA, version: 1 },
    ]);
    expect(p.aReforzar()).toEqual(['INF']);
    expect(p.habilidadMasDebil()).toBe('VOC');
    expect(p.promedio()).toBe(48);
    expect(PerfilLector.nuevo('otro').habilidadMasDebil()).toBe('LIT');
  });
});

describe('Recomendaciones (RF-055, RN-20)', () => {
  const base = (p: Partial<CandidatosRecomendacion> = {}): CandidatosRecomendacion => ({
    asignaciones: [],
    mision: null,
    fichas: [
      { id: 'inf-2', nivelDificultad: 2, habilidades: ['INF'] },
      { id: 'inf-4', nivelDificultad: 4, habilidades: ['INF'] },
      { id: 'lit-2', nivelDificultad: 2, habilidades: ['LIT'] },
    ],
    terminadas: new Set(),
    habilidadDebil: 'INF',
    nivel: 3,
    ...p,
  });

  it('la asignación docente va primero, luego la misión en curso y la de la habilidad más débil a su nivel', () => {
    const r = recomendar(base({
      asignaciones: [{ asignacionId: 'a1', tipo: 'LECTURA', contenidoId: 'asignada', titulo: 'La asignada' }],
      mision: { misionId: 'm1', mision: 'Pistas del bosque', lecturaId: 'de-mision' },
    }));
    expect(r.map((x) => [x.tipo, x.lecturaId])).toEqual([['ASIGNACION_DOCENTE', 'asignada'], ['LECTURA_MISION', 'de-mision'], ['LECTURA_HABILIDAD_DEBIL', 'inf-2']]);
    expect(r[1]?.mision).toEqual({ id: 'm1', titulo: 'Pistas del bosque' });
    expect(r[2]).toMatchObject({ habilidad: 'INF', motivo: 'Habilidad por reforzar: INF' });
  });

  it('a igual cercanía a su nivel elige la más fácil; nunca repite ni recomienda lo ya leído', () => {
    expect(recomendar(base({ nivel: 3 }))[0]?.lecturaId).toBe('inf-2');
    expect(recomendar(base({ nivel: 4 }))[0]?.lecturaId).toBe('inf-4');
    expect(recomendar(base({ terminadas: new Set(['inf-2']) }))[0]?.lecturaId).toBe('inf-4');
    const repetida = recomendar(base({ mision: { misionId: 'm1', mision: 'M', lecturaId: 'inf-2' } }));
    expect(repetida.map((x) => x.lecturaId)).toEqual(['inf-2', 'inf-4']);
  });

  it('una asignación ya leída se salta; una de misión se recomienda con su misión', () => {
    const r = recomendar(base({
      asignaciones: [
        { asignacionId: 'a1', tipo: 'LECTURA', contenidoId: 'leida', titulo: 'Leída' },
        { asignacionId: 'a2', tipo: 'MISION', contenidoId: 'mision-x', titulo: 'Misión X' },
      ],
      terminadas: new Set(['leida']),
    }));
    expect(r[0]).toMatchObject({ tipo: 'ASIGNACION_DOCENTE', lecturaId: null, asignacionId: 'a2', mision: { id: 'mision-x', titulo: 'Misión X' } });
  });

  it('a lo sumo 3; sin nada de lo anterior, refuerzo con otra lectura o volviendo a leer (siempre ≥ 1 si hay lecturas)', () => {
    const muchas = recomendar(base({
      asignaciones: [{ asignacionId: 'a1', tipo: 'LECTURA', contenidoId: 'x', titulo: 'X' }],
      mision: { misionId: 'm', mision: 'M', lecturaId: 'y' },
    }));
    expect(muchas).toHaveLength(3);
    const otra = recomendar(base({ habilidadDebil: 'ARG' }));
    expect(otra).toEqual([expect.objectContaining({ tipo: 'REFUERZO', lecturaId: 'inf-2', motivo: 'Para seguir practicando' })]);
    const releer = recomendar(base({ habilidadDebil: 'LIT', terminadas: new Set(['inf-2', 'inf-4', 'lit-2']) }));
    expect(releer).toEqual([expect.objectContaining({ tipo: 'REFUERZO', lecturaId: 'lit-2', motivo: 'Volver a leer para practicar' })]);
    expect(recomendar(base({ fichas: [] }))).toEqual([]);
  });
});
