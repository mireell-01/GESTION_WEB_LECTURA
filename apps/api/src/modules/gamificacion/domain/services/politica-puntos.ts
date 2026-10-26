import type { RangoEdad } from '../../../shared-kernel/public-api';
import { ParametrosGamificacion } from './parametros';

/** RF-056: por qué se otorgó cada asiento del libro de puntos. */
export type MotivoPuntos =
  | 'ITEM_CORRECTO'
  | 'CORRECTO_TRAS_PISTA'
  | 'RESPUESTA_ABIERTA'
  | 'LECTURA_COMPLETADA'
  | 'SUBIDA_NIVEL_CNEB'
  | 'RETO_DEL_DIA'
  | `RACHA_${number}`;

export interface ItemCerrado {
  /** null: respuesta abierta, que espera la valoración docente (RN-19). */
  esCorrecta: boolean | null;
  pistasUsadas: number;
  palabras: number | null;
}

/** RN-19: palabras mínimas de una respuesta abierta para otorgar puntos de esfuerzo (R1 escribe como R2). */
export function palabrasMinimas(rango: RangoEdad | null, p: ParametrosGamificacion): number {
  return rango === 'R3' ? p.respuestasAbiertas.palabrasMinimasR3 : p.respuestasAbiertas.palabrasMinimasR2;
}

/**
 * RN-11, RN-19: puntos de una pregunta cerrada en la lectura. Acertar a la primera vale más que
 * acertar tras una pista; la respuesta abierta con esfuerzo vale lo de un acierto. RN-10: equivocarse
 * no resta (no hay asiento).
 */
export function puntosDeItem(
  item: ItemCerrado,
  p: ParametrosGamificacion,
  rango: RangoEdad | null,
): { motivo: MotivoPuntos; puntos: number } | null {
  if (item.esCorrecta === true) {
    return item.pistasUsadas > 0
      ? { motivo: 'CORRECTO_TRAS_PISTA', puntos: p.puntos.correctoTrasPista }
      : { motivo: 'ITEM_CORRECTO', puntos: p.puntos.itemCorrecto };
  }
  if (item.esCorrecta === null && (item.palabras ?? 0) >= palabrasMinimas(rango, p)) {
    return { motivo: 'RESPUESTA_ABIERTA', puntos: p.puntos.itemCorrecto };
  }
  return null;
}

/** RN-12: repetir una lectura ya terminada otorga solo un porcentaje de los puntos (redondeado). */
export function conRepeticion(puntos: number, esRepeticion: boolean, p: ParametrosGamificacion): number {
  return esRepeticion ? Math.round((puntos * p.antiFarming.porcentajeRepeticion) / 100) : puntos;
}

/** RN-12, RN-10: nunca más que lo que queda del tope diario, y nunca negativo. */
export function dentroDelTope(puntos: number, yaGanadosHoy: number, p: ParametrosGamificacion): number {
  return Math.max(0, Math.min(puntos, p.antiFarming.topeDiario - yaGanadosHoy));
}

/** RN-11: bono por llegar a 3, 7 o 30 días de racha (o a los hitos que fije el administrador). */
export function bonoRacha(dias: number, p: ParametrosGamificacion): number | null {
  return p.puntos.racha[String(dias)] ?? null;
}
