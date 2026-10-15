/**
 * Value Object: NivelCNEB — escala de logro del Currículo Nacional (SRS §6, RN-08).
 * C en inicio (0–39) · B en proceso (40–64) · A logro esperado (65–84) · AD logro destacado (85–100).
 */
export type NivelCNEB = 'C' | 'B' | 'A' | 'AD';

/** RN-08: con menos de 5 ítems respondidos aún no se declara nivel. */
export const MINIMO_ITEMS_NIVEL = 5;

export const ETIQUETA_NIVEL: Record<NivelCNEB, string> = {
  C: 'En inicio',
  B: 'En proceso',
  A: 'Logrado',
  AD: 'Destacado',
};

export function nivelCnebDe(maestria: number): NivelCNEB {
  if (maestria >= 85) return 'AD';
  if (maestria >= 65) return 'A';
  if (maestria >= 40) return 'B';
  return 'C';
}

/** Devuelve el nivel o `null` ("Aún descubriendo") si no hay ítems suficientes. */
export function nivelDeclarado(maestria: number, itemsRespondidos: number): NivelCNEB | null {
  return itemsRespondidos >= MINIMO_ITEMS_NIVEL ? nivelCnebDe(maestria) : null;
}
