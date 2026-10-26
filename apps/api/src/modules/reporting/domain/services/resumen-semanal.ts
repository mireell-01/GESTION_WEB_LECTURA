import { fechaLocalLima, lunesDeLaSemana } from '../../../shared-kernel/public-api';

/** Actividad de un estudiante en una semana de Lima (fila de `reporting.mv_actividad_semanal`). */
export interface ActividadSemanal {
  estudianteId: string;
  /** Lunes de la semana ("AAAA-MM-DD"). */
  semana: string;
  lecturas: number;
  minutos: number;
  respuestas: number;
}

export interface ResumenSemana {
  semana: string;
  estudiantesActivos: number;
  totalEstudiantes: number;
  lecturasFinalizadas: number;
  minutosLectura: number;
  respuestas: number;
}

/** RF-065: cuánto leyó el aula en la semana (activos = estudiantes con al menos una sesión). */
export function resumirSemana(semana: string, actividad: ActividadSemanal[], totalEstudiantes: number): ResumenSemana {
  const filas = actividad.filter((a) => a.semana === semana);
  return {
    semana,
    estudiantesActivos: new Set(filas.map((f) => f.estudianteId)).size,
    totalEstudiantes,
    lecturasFinalizadas: filas.reduce((s, f) => s + f.lecturas, 0),
    minutosLectura: Math.round(filas.reduce((s, f) => s + f.minutos, 0)),
    respuestas: filas.reduce((s, f) => s + f.respuestas, 0),
  };
}

function restarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) - dias * 86_400_000).toISOString().slice(0, 10);
}

/** La semana en curso y la anterior (lunes de cada una), en hora de Lima. */
export function semanasDe(ahora: Date): { actual: string; anterior: string } {
  const actual = lunesDeLaSemana(fechaLocalLima(ahora));
  return { actual, anterior: restarDias(actual, 7) };
}

/** El resumen de la semana anterior se envía desde el lunes a las 07:00 de Lima. */
export const HORA_RESUMEN_LIMA = 7;

/** La semana que toca resumir, o null si aún es lunes antes de las 07:00 de Lima. */
export function semanaPorResumir(ahora: Date): string | null {
  const lima = new Date(ahora.getTime() - 5 * 3_600_000);
  const esLunes = lima.getUTCDay() === 1;
  if (esLunes && lima.getUTCHours() < HORA_RESUMEN_LIMA) return null;
  return semanasDe(ahora).anterior;
}
