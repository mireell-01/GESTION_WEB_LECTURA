import { Habilidad, HABILIDADES, nivelCnebDe, nivelDeclarado, NivelCNEB } from '../../../shared-kernel/public-api';

/** RN-07: el puntaje de un ítem se pondera por su dificultad (1 a 5). */
export function factorDificultad(dificultad: number): number {
  return 0.8 + 0.1 * dificultad;
}

export interface ResultadoHabilidad {
  /** RF-035: valor inicial de maestría, 0–100. */
  valor: number;
  /** RF-035: nivel CNEB inicial que corresponde al valor. */
  nivel: NivelCNEB;
  items: number;
  /** RN-08: con menos de 5 ítems el perfil lector aún no "declara" el nivel ("Aún descubriendo"). */
  nivelDeclarado: NivelCNEB | null;
}

export type ResultadoPorHabilidad = Record<Habilidad, ResultadoHabilidad>;

export interface RespuestaCalificada {
  habilidad: Habilidad;
  nivelDificultad: number;
  esCorrecta: boolean;
}

/**
 * RF-035: nivel inicial por habilidad. En el reto no hay pistas, así que cada ítem vale 1 si es
 * correcto y 0 si no (RN-07); se pondera por dificultad (0,8 + 0,1 × dificultad) × 100 y se
 * promedian los ítems de la habilidad, acotado a 0–100. Es el valor con el que el perfil lector
 * (Módulo 7) empezará su promedio móvil.
 */
export function calcularResultado(respuestas: readonly RespuestaCalificada[]): ResultadoPorHabilidad {
  const resultado = {} as ResultadoPorHabilidad;
  for (const habilidad of HABILIDADES) {
    const suyas = respuestas.filter((r) => r.habilidad === habilidad);
    const suma = suyas.reduce((s, r) => s + (r.esCorrecta ? factorDificultad(r.nivelDificultad) * 100 : 0), 0);
    const valor = suyas.length === 0 ? 0 : Math.round(Math.min(100, Math.max(0, suma / suyas.length)) * 10) / 10;
    resultado[habilidad] = { valor, nivel: nivelCnebDe(valor), items: suyas.length, nivelDeclarado: nivelDeclarado(valor, suyas.length) };
  }
  return resultado;
}

/** Ítems respondidos por habilidad: el perfil lector los cuenta para declarar el nivel (RN-08). */
export function itemsDe(resultado: ResultadoPorHabilidad): Record<Habilidad, number> {
  return Object.fromEntries(HABILIDADES.map((h) => [h, resultado[h].items])) as Record<Habilidad, number>;
}

/** Los valores de maestría por habilidad, como los publica el evento DiagnosticoFinalizado. */
export function maestriasDe(resultado: ResultadoPorHabilidad): Record<Habilidad, number> {
  return Object.fromEntries(HABILIDADES.map((h) => [h, resultado[h].valor])) as Record<Habilidad, number>;
}
