import { MINIMO_ITEMS_NIVEL, RangoEdad } from '../../../shared-kernel/public-api';

/** RN-07: peso del ítem nuevo en el promedio móvil exponencial. */
export const ALFA = 0.3;
/** RF-054: con maestría menor a 40 (y al menos 5 ítems) la habilidad queda "a reforzar". */
export const UMBRAL_REFUERZO = 40;

const acotar = (v: number, min = 0, max = 100) => Math.min(max, Math.max(min, v));
const redondear = (v: number) => Math.round(v * 100) / 100;

/** RN-07: el ítem se pondera por su dificultad (1 a 5). */
export function factorDificultad(dificultad: number): number {
  return 0.8 + 0.1 * dificultad;
}

/** RN-07: lo que "mide" un ítem: su puntaje (0–1, según las pistas) × factor de dificultad × 100, acotado a 0–100. */
export function puntajeObservado(puntajeItem: number, dificultad: number): number {
  return acotar(puntajeItem * factorDificultad(dificultad) * 100);
}

/**
 * RN-07: maestría = EMA (α = 0,3) de los puntajes observados, acotada a 0–100. Una habilidad sin
 * nada medido (ni ítems ni valor del reto inicial) toma el primer valor tal cual: no hay de dónde promediar.
 */
export function siguienteMaestria(
  anterior: number,
  itemsContados: number,
  observado: number,
): number {
  const sinHistoria = itemsContados === 0 && anterior === 0;
  const valor = sinHistoria ? observado : ALFA * observado + (1 - ALFA) * anterior;
  return redondear(acotar(valor));
}

/** RF-054. */
export function aReforzar(valor: number, itemsContados: number): boolean {
  return itemsContados >= MINIMO_ITEMS_NIVEL && valor < UMBRAL_REFUERZO;
}

/** El nivel típico de cada edad (el mismo con que la biblioteca parte, Módulo 3). */
export const NIVEL_BASE: Record<RangoEdad, number> = { R1: 1, R2: 2, R3: 3 };

/**
 * Nivel de lectura (dificultad 1–5) para la biblioteca y las recomendaciones (RN-20): el típico de su
 * edad, uno menos si su maestría promedio está en inicio, uno más si es "logrado" y dos si es
 * "destacado" (escala CNEB), entre 1 y 5.
 */
export function nivelLectura(rango: RangoEdad, maestriaPromedio: number): number {
  const ajuste =
    maestriaPromedio >= 85 ? 2 : maestriaPromedio >= 65 ? 1 : maestriaPromedio >= 40 ? 0 : -1;
  return acotar(NIVEL_BASE[rango] + ajuste, 1, 5);
}
