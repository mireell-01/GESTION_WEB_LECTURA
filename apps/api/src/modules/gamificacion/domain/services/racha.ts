import { diasEntre, lunesDeLaSemana } from '../../../shared-kernel/public-api';

/**
 * RF-061: racha de días consecutivos con actividad lectora (una lectura terminada o el reto del día
 * completado), por fecha de Lima. Se reinicia si pasa un día sin actividad, salvo que el comodín de esa
 * semana (lunes a domingo) cubra el día perdido.
 */
export interface EstadoRacha {
  dias: number;
  mejor: number;
  /** Último día con actividad ("AAAA-MM-DD"). */
  ultimaFecha: string | null;
  /** Lunes de la semana en que se usó el comodín. */
  comodinSemana: string | null;
}

export type CambioRacha = 'IGUAL' | 'SUMA' | 'COMODIN' | 'REINICIO';

export const RACHA_VACIA: EstadoRacha = { dias: 0, mejor: 0, ultimaFecha: null, comodinSemana: null };

function diaSiguiente(fecha: string): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/** ¿Queda el comodín de la semana del día perdido? */
export function comodinDisponible(r: EstadoRacha, diaPerdido: string): boolean {
  return r.comodinSemana !== lunesDeLaSemana(diaPerdido);
}

/** Registra un día con actividad. Un segundo logro el mismo día (o un evento atrasado) no cambia nada. */
export function registrarDia(r: EstadoRacha, fecha: string): { racha: EstadoRacha; cambio: CambioRacha } {
  if (r.ultimaFecha !== null && fecha <= r.ultimaFecha) return { racha: r, cambio: 'IGUAL' };
  const hueco = r.ultimaFecha === null ? null : diasEntre(r.ultimaFecha, fecha);
  let dias = 1;
  let comodinSemana = r.comodinSemana;
  let cambio: CambioRacha = 'REINICIO';
  if (hueco === 1) {
    dias = r.dias + 1;
    cambio = 'SUMA';
  } else if (hueco === 2 && r.dias > 0) {
    const perdido = diaSiguiente(r.ultimaFecha as string);
    if (comodinDisponible(r, perdido)) {
      dias = r.dias + 1;
      comodinSemana = lunesDeLaSemana(perdido);
      cambio = 'COMODIN';
    }
  }
  return { racha: { dias, mejor: Math.max(r.mejor, dias), ultimaFecha: fecha, comodinSemana }, cambio };
}

/** La racha que ve el niño hoy: 0 si ya se cortó (ni actividad ayer ni comodín que cubra el día). */
export function rachaVigente(r: EstadoRacha, hoy: string): number {
  if (r.ultimaFecha === null || r.dias === 0) return 0;
  const hueco = diasEntre(r.ultimaFecha, hoy);
  if (hueco <= 1) return r.dias;
  if (hueco === 2 && comodinDisponible(r, diaSiguiente(r.ultimaFecha))) return r.dias;
  return 0;
}

/** El comodín de esta semana sigue sin usar. */
export function comodinDeEstaSemana(r: EstadoRacha, hoy: string): boolean {
  return comodinDisponible(r, hoy);
}
