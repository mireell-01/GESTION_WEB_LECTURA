import { describe, expect, it } from 'vitest';

import { aReforzar, factorDificultad, nivelLectura, puntajeObservado, siguienteMaestria } from '../../../../src/modules/progreso/domain/services/maestria';
import { ETIQUETA_NIVEL, nivelCnebDe, nivelDeclarado } from '../../../../src/modules/shared-kernel/domain/value-objects/nivel-cneb';

/**
 * Nivel 1 — Maestría y nivel CNEB (RN-07, RN-08, RF-052, RF-054 y NivelCNEB del SRS §6), en tres partes:
 *  - Caja negra (CN-xx): diseñada solo con el SRS y las firmas, sin leer el código (partición de
 *    equivalencia y valores límite).
 *  - Caja blanca (CB-xx): lo que la caja negra no alcanzó, para llegar al 100 % de sentencias, ramas y condiciones.
 *  - Contraste con IA (IA-xx): escenarios propuestos por la IA que se aceptaron porque aplican al negocio.
 * El análisis está en docs/pruebas/15-caja-negra-cobertura.md.
 */

describe('[Progreso][Core][Fast] Caja negra: factor de dificultad (RN-07: 0,8 + 0,1 × dificultad, dificultad 1–5)', () => {
  it.each([
    ['CN-01', 1, 0.9],
    ['CN-02', 3, 1.1],
    ['CN-03', 5, 1.3],
  ])('%s: dificultad %d → factor %d', (_id, dificultad, factor) => {
    expect(factorDificultad(dificultad)).toBeCloseTo(factor, 10);
  });
});

describe('[Progreso][Core][Fast] Caja negra: puntaje ponderado (RN-07: puntaje × factor × 100)', () => {
  it.each([
    ['CN-05', 'con P1, dificultad media', 0.75, 3, 82.5],
    ['CN-06', 'con P3, dificultad mínima', 0.25, 1, 22.5],
    ['CN-07', 'con la explicación: 0, sea cual sea la dificultad', 0, 5, 0],
  ])('%s: %s', (_id, _caso, puntaje, dificultad, esperado) => {
    expect(puntajeObservado(puntaje, dificultad)).toBeCloseTo(esperado, 10);
  });

  // El SRS dice "puntaje ponderado … × 100, acotada a 0–100" sin aclarar si se acota cada ítem o solo la
  // maestría. Los casos se diseñaron con la segunda lectura (110 y 130) y fallaron: el código acota cada ítem,
  // decisión del Módulo 7. Quedan con la decisión vigente; el hallazgo H-1 del informe pide confirmarla.
  it.each([
    ['CN-04', 'sin pista, dificultad media: 110 se acota a 100', 1, 3],
    ['CN-08', 'sin pista, dificultad máxima: 130 se acota a 100', 1, 5],
  ])('%s: %s', (_id, _caso, puntaje, dificultad) => {
    expect(puntajeObservado(puntaje, dificultad)).toBe(100);
  });
});

describe('[Progreso][Core][Fast] Caja negra: maestría como EMA con α = 0,3, acotada a 0–100 (RN-07, RF-053)', () => {
  it('CN-09: clase normal: 0,3 × observado + 0,7 × anterior', () => {
    expect(siguienteMaestria(50, 3, 100)).toBeCloseTo(65, 10);
  });

  it('CN-10: un error baja la maestría sin volverla negativa (0,7 × 100 = 70)', () => {
    expect(siguienteMaestria(100, 8, 0)).toBeCloseTo(70, 10);
  });

  it('CN-11: límite superior: un ponderado de 130 sobre 95 daría 105,5 y se acota a 100', () => {
    expect(siguienteMaestria(95, 5, 130)).toBe(100);
  });

  it('CN-12: límite inferior: desde 0 con observado 0 queda en 0', () => {
    expect(siguienteMaestria(0, 5, 0)).toBe(0);
  });

  it('CN-13: el primer ítem de la habilidad: la maestría es lo observado (inicio de la EMA)', () => {
    expect(siguienteMaestria(0, 0, 82.5)).toBeCloseTo(82.5, 10);
  });

  it('CN-14: el resultado siempre queda entre 0 y 100, aunque se acumulen aciertos de dificultad 5', () => {
    let maestria = 0;
    for (let i = 0; i < 40; i++) {
      maestria = siguienteMaestria(maestria, i, puntajeObservado(1, 5));
      expect(maestria).toBeGreaterThanOrEqual(0);
      expect(maestria).toBeLessThanOrEqual(100);
    }
    expect(maestria).toBe(100);
  });
});

describe('[Progreso][Core][Fast] Caja negra: nivel CNEB (C 0–39 · B 40–64 · A 65–84 · AD 85–100)', () => {
  it.each([
    ['CN-15', 0, 'C'],
    ['CN-16', 39, 'C'],
    ['CN-17', 40, 'B'],
    ['CN-18', 64, 'B'],
    ['CN-19', 65, 'A'],
    ['CN-20', 84, 'A'],
    ['CN-21', 85, 'AD'],
    ['CN-22', 100, 'AD'],
  ])('%s: maestría %d → %s', (_id, maestria, nivel) => {
    expect(nivelCnebDe(maestria)).toBe(nivel);
  });

  it.each([
    ['CN-23', 39.9, 'C'],
    ['CN-24', 64.99, 'B'],
    ['CN-25', 84.5, 'A'],
  ])('%s: la maestría es decimal; entre dos tramos manda el umbral: %d → %s', (_id, maestria, nivel) => {
    expect(nivelCnebDe(maestria)).toBe(nivel);
  });
});

describe('[Progreso][Core][Fast] Caja negra: nivel declarado con ≥ 5 ítems (RN-08)', () => {
  it('CN-26: con 0 ítems aún no hay nivel ("Aún descubriendo")', () => {
    expect(nivelDeclarado(90, 0)).toBeNull();
  });

  it('CN-27: límite: con 4 ítems aún no hay nivel', () => {
    expect(nivelDeclarado(90, 4)).toBeNull();
  });

  it('CN-28: límite: con 5 ítems se declara el nivel de su maestría', () => {
    expect(nivelDeclarado(90, 5)).toBe('AD');
  });

  it('CN-29: con más de 5 ítems también, en cualquier tramo', () => {
    expect(nivelDeclarado(20, 12)).toBe('C');
  });
});

describe('[Progreso][Core][Fast] Caja negra: habilidad "a reforzar" (RF-054: maestría < 40 y ≥ 5 ítems)', () => {
  it.each([
    ['CN-30', 'maestría bajo 40 con 5 ítems', 39.99, 5, true],
    ['CN-31', 'límite: maestría 40 ya no', 40, 5, false],
    ['CN-32', 'límite: con 4 ítems todavía no', 10, 4, false],
    ['CN-33', 'maestría 0 con muchos ítems', 0, 20, true],
    ['CN-34', 'maestría alta con muchos ítems', 90, 20, false],
  ])('%s: %s', (_id, _caso, maestria, items, esperado) => {
    expect(aReforzar(maestria, items)).toBe(esperado);
  });
});

describe('[Progreso][Core][Fast] Caja blanca: lo que la caja negra no alcanzó (RN-07, RN-20)', () => {
  it('CB-01: sin ítems pero con el valor del reto inicial, ya hay historia: se promedia (condición anterior === 0 en falso)', () => {
    expect(siguienteMaestria(70, 0, 100)).toBe(79);
  });

  it.each([
    ['CB-02', 'destacado: +2', 'R2', 90, 4],
    ['CB-03', 'logrado: +1', 'R2', 70, 3],
    ['CB-04', 'en proceso: igual al de su edad', 'R2', 50, 2],
    ['CB-05', 'en inicio: −1', 'R2', 30, 1],
    ['CB-06', 'nunca baja de 1', 'R1', 10, 1],
    ['CB-07', 'nunca pasa de 5', 'R3', 95, 5],
    // Los límites exactos de la escala CNEB: los encontró la siembra de errores (sección 7 del informe).
    ['CB-08', 'límite: 85 ya es destacado', 'R2', 85, 4],
    ['CB-09', 'límite: 65 ya es logrado', 'R2', 65, 3],
    ['CB-10', 'límite: 40 ya es en proceso', 'R2', 40, 2],
    ['CB-11', 'límite: 39,99 sigue en inicio', 'R2', 39.99, 1],
  ])('%s: nivel de lectura, %s', (_id, _caso, rango, maestria, nivel) => {
    expect(nivelLectura(rango as 'R1' | 'R2' | 'R3', maestria)).toBe(nivel);
  });
});

describe('[Progreso][Core][Fast] Contraste con IA: escenarios aceptados (RN-07, RF-051, RF-052, RF-054)', () => {
  it('IA-03: la valoración docente con rúbrica (0,33 · 0,67 · 1) también se pondera por dificultad', () => {
    expect(puntajeObservado(0.67, 4)).toBeCloseTo(80.4, 10);
    expect(puntajeObservado(0.33, 1)).toBeCloseTo(29.7, 10);
  });

  it('IA-07: acertar nunca baja la maestría y equivocarse nunca la sube', () => {
    for (let anterior = 0; anterior <= 100; anterior += 2.5) {
      for (const observado of [0, 22.5, 50, 82.5, 100]) {
        const siguiente = siguienteMaestria(anterior, 5, observado);
        if (observado >= anterior) expect(siguiente).toBeGreaterThanOrEqual(anterior);
        else expect(siguiente).toBeLessThanOrEqual(anterior);
      }
    }
  });

  it('IA-08: con 5 ítems o más, "a reforzar" coincide exactamente con el nivel C', () => {
    for (let maestria = 0; maestria <= 100; maestria += 0.25) {
      expect(aReforzar(maestria, 5)).toBe(nivelDeclarado(maestria, 5) === 'C');
    }
  });

  it('IA-10: cada nivel muestra su etiqueta en lenguaje infantil (RF-052)', () => {
    expect([0, 40, 65, 85].map((m) => ETIQUETA_NIVEL[nivelCnebDe(m)])).toEqual(['En inicio', 'En proceso', 'Logrado', 'Destacado']);
  });
});
