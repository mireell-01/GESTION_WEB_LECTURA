import { describe, expect, it } from 'vitest';

import { MAX_LECTURAS_POR_MISION, Mision } from '../../../../src/modules/aventura/domain/entities/mision';
import { EstadoDeMundo, ProgresoAventura } from '../../../../src/modules/aventura/domain/entities/progreso-aventura';
import { DatoMisionInvalidoError } from '../../../../src/modules/aventura/domain/errors/errores-aventura';
import {
  avanzarEstado,
  estadoSegunAvance,
  evaluarUmbral,
  mundoInicial,
} from '../../../../src/modules/aventura/domain/services/politica-progresion';
import { uuidV7 } from '../../../../src/modules/shared-kernel/infrastructure/uuid';
import { MUNDOS } from '../dobles';

/** Nivel 1 — Dominio de Aventura: progresión (RF-031, RF-033, RN-09), progreso y misiones (RF-032). */
const AHORA = new Date('2026-10-17T15:00:00Z');
const estados = (p: ProgresoAventura) => p.mundos.map((m) => m.estado);

describe('Política de progresión', () => {
  it('RF-033: con LIT y VOC ≥ 65 empieza en el mundo 2; si no, en el 1 (nunca más allá del 2)', () => {
    expect(mundoInicial({ LIT: 70, VOC: 68, INF: 10 })).toBe(2); // escenario UAT-01 del SRS
    expect(mundoInicial({ LIT: 65, VOC: 65 })).toBe(2); // el umbral es inclusivo
    expect(mundoInicial({ LIT: 64.9, VOC: 99 })).toBe(1);
    expect(mundoInicial({ LIT: 100, VOC: 100, INF: 100, CRI: 100, ARG: 100 })).toBe(2);
    expect(mundoInicial({ VOC: 90 })).toBe(1);
    expect(mundoInicial(null)).toBe(1);
  });

  it('RN-09: todas las habilidades foco ≥ 65 y al menos 3 misiones completadas', () => {
    expect(evaluarUmbral(['LIT', 'VOC'], { LIT: 70, VOC: 65 }, 3)).toEqual({ cumple: true, habilidadesPendientes: [], misionesFaltantes: 0 });
    expect(evaluarUmbral(['LIT', 'VOC'], { LIT: 70, VOC: 65 }, 2)).toEqual({ cumple: false, habilidadesPendientes: [], misionesFaltantes: 1 });
    expect(evaluarUmbral(['LIT', 'VOC'], { LIT: 70, VOC: 64 }, 5)).toEqual({ cumple: false, habilidadesPendientes: ['VOC'], misionesFaltantes: 0 });
    // Sin perfil lector (Módulo 7) la maestría no se conoce: nunca se desbloquea por adivinar.
    expect(evaluarUmbral(['LIT', 'VOC'], null, 10).cumple).toBe(false);
  });

  it('RF-032: la misión se completa cuando todas sus lecturas terminaron; en curso si alguna empezó', () => {
    const avance = new Map([['a', 'FINALIZADA' as const], ['b', 'EN_CURSO' as const]]);
    expect(estadoSegunAvance(['a'], avance)).toBe('COMPLETADA');
    expect(estadoSegunAvance(['a', 'b'], avance)).toBe('EN_CURSO');
    expect(estadoSegunAvance(['c'], avance)).toBe('PENDIENTE');
    expect(estadoSegunAvance([], avance)).toBe('PENDIENTE');
  });

  it('lo logrado no se pierde: el estado de una misión nunca retrocede', () => {
    expect(avanzarEstado('PENDIENTE', 'EN_CURSO')).toBe('EN_CURSO');
    expect(avanzarEstado('EN_CURSO', 'COMPLETADA')).toBe('COMPLETADA');
    expect(avanzarEstado('COMPLETADA', 'EN_CURSO')).toBe('COMPLETADA');
    expect(avanzarEstado('EN_CURSO', 'PENDIENTE')).toBe('EN_CURSO');
  });
});

describe('ProgresoAventura', () => {
  it('RF-033: en el mundo 1, el resto bloqueado y sin celebración para el mundo inicial', () => {
    const p = ProgresoAventura.posicionar('nino', MUNDOS, 1, AHORA);
    expect(estados(p)).toEqual(['DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(p.actual?.numero).toBe(1);
    expect(p.porCelebrar()).toEqual([]);
  });

  it('RF-033: empezar en el mundo 2 deja el Explorador como completado', () => {
    const p = ProgresoAventura.posicionar('nino', [...MUNDOS].reverse(), 2, AHORA);
    expect(estados(p)).toEqual(['COMPLETADO', 'DISPONIBLE', 'BLOQUEADO', 'BLOQUEADO', 'BLOQUEADO']);
    expect(p.mundos[0]).toMatchObject({ completadoEn: AHORA, desbloqueadoEn: AHORA });
    expect(() => ProgresoAventura.posicionar('nino', MUNDOS, 7, AHORA)).toThrow('No existe el mundo 7');
  });

  it('RF-031: completar el mundo actual abre el siguiente, que se celebra una sola vez', () => {
    const p = ProgresoAventura.posicionar('nino', MUNDOS, 1, AHORA);
    const despues = new Date(AHORA.getTime() + 60_000);
    const { completado, desbloqueado } = p.completarActual(despues);
    expect(completado).toMatchObject({ numero: 1, estado: 'COMPLETADO', completadoEn: despues });
    expect(desbloqueado).toMatchObject({ numero: 2, estado: 'DISPONIBLE', desbloqueadoEn: despues, celebradoEn: null });
    expect(p.porCelebrar().map((m) => m.numero)).toEqual([2]);
    expect(p.marcarCelebrado('mundo-2', despues)).toBe(true);
    expect(p.marcarCelebrado('mundo-2', despues)).toBe(false);
    expect(p.marcarCelebrado('mundo-4', despues)).toBe(false); // bloqueado: nada que celebrar
    expect(p.porCelebrar()).toEqual([]);
  });

  it('al completar el último mundo no queda ninguno disponible', () => {
    const p = ProgresoAventura.posicionar('nino', MUNDOS, 2, AHORA);
    for (let i = 0; i < 3; i++) p.completarActual(AHORA);
    expect(p.completarActual(AHORA).desbloqueado).toBeNull();
    expect(estados(p)).toEqual(['COMPLETADO', 'COMPLETADO', 'COMPLETADO', 'COMPLETADO', 'COMPLETADO']);
    expect(p.actual).toBeNull();
    expect(() => p.completarActual(AHORA)).toThrow('No hay un mundo disponible');
  });

  it('SRS §6: rechaza progresos imposibles (completado tras un bloqueado, dos disponibles, fechas o mundos que faltan)', () => {
    const base = ProgresoAventura.posicionar('nino', MUNDOS, 2, AHORA).mundos;
    const con = (cambios: Partial<EstadoDeMundo>[]) => base.map((m, i) => ({ ...m, ...cambios[i] }));
    const bloqueado = { estado: 'BLOQUEADO' as const, desbloqueadoEn: null, completadoEn: null };
    expect(() => ProgresoAventura.desdePersistencia('nino', con([bloqueado, { estado: 'COMPLETADO', completadoEn: AHORA }]))).toThrow('Progreso inválido');
    expect(() => ProgresoAventura.desdePersistencia('nino', con([{ estado: 'DISPONIBLE', completadoEn: null }]))).toThrow('Progreso inválido');
    expect(() => ProgresoAventura.desdePersistencia('nino', con([{}, { desbloqueadoEn: null }]))).toThrow('fechas del mundo 2');
    expect(() => ProgresoAventura.desdePersistencia('nino', base.filter((m) => m.numero !== 3))).toThrow('sin saltos');
    expect(() => ProgresoAventura.desdePersistencia('nino', [])).toThrow('necesita los mundos');
    // Uno completado de más, sin ninguno disponible, deja al niño trabado: tampoco vale.
    expect(() => ProgresoAventura.desdePersistencia('nino', con([{}, { estado: 'COMPLETADO', completadoEn: AHORA }]))).toThrow('Progreso inválido');
    expect(ProgresoAventura.desdePersistencia('nino', [...base].reverse()).actual?.numero).toBe(2);
  });
});

describe('Misión', () => {
  const lecturas = (n: number) => Array.from({ length: n }, () => uuidV7());
  const crear = (datos: Partial<{ titulo: string; descripcion: string; lecturaIds: string[] }> = {}, orden = 1) =>
    Mision.crear({
      id: 'mision',
      mundoId: 'mundo-1',
      rangoEdad: 'R2',
      orden,
      datos: { titulo: 'La cueva de las letras', descripcion: '', lecturaIds: lecturas(2), ...datos },
    });

  it('normaliza el título y conserva el orden de las lecturas', () => {
    const ids = lecturas(3);
    const m = crear({ titulo: '  La   cueva  ', descripcion: '  Sigue el mapa.  ', lecturaIds: ids });
    expect(m.titulo).toBe('La cueva');
    expect(m.descripcion).toBe('Sigue el mapa.');
    expect(m.lecturaIds).toEqual(ids);
    m.lecturaIds.push('otra'); // es una copia
    expect(m.lecturaIds).toHaveLength(3);
  });

  it('valida título, descripción, lecturas, posición y edad', () => {
    const repetida = uuidV7();
    expect(() => crear({ titulo: 'Ab' })).toThrow(DatoMisionInvalidoError);
    expect(() => crear({ titulo: 'x'.repeat(81) })).toThrow('entre 3 y 80');
    expect(() => crear({ descripcion: 'x'.repeat(301) })).toThrow('hasta 300');
    expect(() => crear({ lecturaIds: [] })).toThrow('al menos una lectura');
    expect(() => crear({ lecturaIds: lecturas(MAX_LECTURAS_POR_MISION + 1) })).toThrow('hasta 10 lecturas');
    expect(() => crear({ lecturaIds: [repetida, repetida] })).toThrow('aparece dos veces');
    expect(() => crear({ lecturaIds: ['no-es-un-id'] })).toThrow('no existe');
    expect(() => crear({}, 0)).toThrow('de 1 a 20');
    expect(() => crear({}, 21)).toThrow('de 1 a 20');
    expect(() => Mision.crear({ id: 'x', mundoId: 'm', rangoEdad: 'R9' as never, orden: 1, datos: { titulo: 'Bien', descripcion: '', lecturaIds: lecturas(1) } })).toThrow('edad');
  });

  it('se actualiza y cambia de posición con las mismas reglas', () => {
    const m = crear();
    m.actualizar({ titulo: 'Nuevo título', descripcion: 'Otra', lecturaIds: lecturas(1) });
    expect(m.titulo).toBe('Nuevo título');
    m.moverA(5);
    expect(m.orden).toBe(5);
    expect(() => m.moverA(1.5)).toThrow('de 1 a 20');
    expect(() => m.actualizar({ titulo: 'Bien', descripcion: '', lecturaIds: [] })).toThrow('al menos una lectura');
  });
});
