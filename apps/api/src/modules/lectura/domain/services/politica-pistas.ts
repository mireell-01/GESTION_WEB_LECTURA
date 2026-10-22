/**
 * RN-07: puntaje del ítem para la maestría según la ayuda que necesitó. Sin pista 1,0 · con P1 0,75 ·
 * con P2 0,5 · con P3 0,25 · si hizo falta la explicación modelada, 0.
 */
export const PUNTAJE_POR_PISTAS = [1, 0.75, 0.5, 0.25] as const;

export function puntajeItem(pistasUsadas: number, conExplicacion: boolean): number {
  if (conExplicacion) return 0;
  return PUNTAJE_POR_PISTAS[Math.min(Math.max(pistasUsadas, 0), 3)] as number;
}

/** RF-051: la valoración docente con la rúbrica de 3 niveles, como puntaje del ítem (0–1). */
export function puntajeDeRubrica(nivel: number): number {
  return Math.round((nivel / 3) * 100) / 100;
}

export const NIVELES_PISTA = ['P1', 'P2', 'P3'] as const;
