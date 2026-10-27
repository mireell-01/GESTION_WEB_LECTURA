import { Habilidad, HABILIDADES } from '../../../shared-kernel/public-api';

/** RF-064: tasa de acierto sin pista sobre las preguntas cerradas que el niño respondió. */
export interface Tasa {
  cerradas: number;
  sinPista: number;
  /** Porcentaje entero; null si aún no respondió preguntas cerradas. */
  tasa: number | null;
}

interface RespuestaMedible {
  habilidad: string;
  esCorrecta: boolean | null;
  pistasUsadas: number;
}

export function tasaSinPista(respuestas: RespuestaMedible[]): Tasa {
  // Las abiertas (esCorrecta null) las valora la docente; no cuentan aquí.
  const cerradas = respuestas.filter((r) => r.esCorrecta !== null);
  const sinPista = cerradas.filter((r) => r.esCorrecta === true && r.pistasUsadas === 0).length;
  return { cerradas: cerradas.length, sinPista, tasa: cerradas.length > 0 ? Math.round((sinPista / cerradas.length) * 100) : null };
}

export function tasasPorHabilidad(respuestas: RespuestaMedible[]): Record<Habilidad, Tasa> {
  return Object.fromEntries(HABILIDADES.map((h) => [h, tasaSinPista(respuestas.filter((r) => r.habilidad === h))])) as Record<Habilidad, Tasa>;
}
