import { MonedasInsuficientesError, RecompensaYaCanjeadaError } from '../errors/errores-gamificacion';

/**
 * RF-062: las monedas de recompensa se ganan con los puntos (1 por cada 10) y se gastan en canjes.
 * Canjear nunca descuenta puntos de nivel: el nivel lector solo sube (RF-057).
 */
export const PUNTOS_POR_MONEDA = 10;

export interface SaldoMonedas {
  puntosTotales: number;
  gastadas: number;
}

export function monedasDisponibles(s: SaldoMonedas): number {
  return Math.max(0, Math.floor(s.puntosTotales / PUNTOS_POR_MONEDA) - s.gastadas);
}

/** Una recompensa se canjea una sola vez y solo si alcanzan las monedas. */
export function validarCanje(s: SaldoMonedas & { yaEsTuya: boolean }, costo: number): void {
  if (s.yaEsTuya) throw new RecompensaYaCanjeadaError();
  const disponibles = monedasDisponibles(s);
  if (disponibles < costo) throw new MonedasInsuficientesError(costo - disponibles);
}
