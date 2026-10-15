/**
 * Value Object: FechaLocalLima — fecha calendario en America/Lima (UTC−5, sin horario de verano).
 * Se usa para el Reto del día (RN-18) y la racha (RF-061).
 */
const DESFASE_LIMA_MS = -5 * 3_600_000;

/** Fecha "AAAA-MM-DD" del instante dado en la zona horaria de Lima. */
export function fechaLocalLima(instante: Date): string {
  return new Date(instante.getTime() + DESFASE_LIMA_MS).toISOString().slice(0, 10);
}

/** Diferencia en días calendario entre dos fechas "AAAA-MM-DD". */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
}

/** Lunes (AAAA-MM-DD) de la semana de la fecha dada, para el comodín semanal de racha. */
export function lunesDeLaSemana(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  const diaSemana = (d.getUTCDay() + 6) % 7; // 0 = lunes
  return new Date(d.getTime() - diaSemana * 86_400_000).toISOString().slice(0, 10);
}
