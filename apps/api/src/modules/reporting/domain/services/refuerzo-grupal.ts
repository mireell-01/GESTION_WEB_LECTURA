import { Habilidad, HABILIDADES } from '../../../shared-kernel/public-api';
import { Celda } from './mapa-calor';

/** RF-066: una dificultad es del grupo cuando la comparte el 30 % del aula o más. */
export const UMBRAL_DIFICULTAD_COMPARTIDA = 0.3;

export interface DificultadCompartida {
  habilidad: Habilidad;
  estudianteIds: string[];
  /** Porcentaje del aula (0–100, entero). */
  porcentaje: number;
}

/**
 * Las habilidades en nivel C ("En inicio") para el 30 % o más de los estudiantes con matrícula activa,
 * de la más extendida a la menos.
 */
export function dificultadesCompartidas(estudiantes: { id: string; celdas: Celda[] }[]): DificultadCompartida[] {
  const total = estudiantes.length;
  if (total === 0) return [];
  return HABILIDADES.map((habilidad) => {
    const ids = estudiantes.filter((e) => e.celdas.some((c) => c.habilidad === habilidad && c.nivel === 'C')).map((e) => e.id);
    return { habilidad, estudianteIds: ids, porcentaje: Math.round((ids.length / total) * 100) };
  })
    .filter((d) => d.estudianteIds.length > 0 && d.estudianteIds.length / total >= UMBRAL_DIFICULTAD_COMPARTIDA)
    .sort((a, b) => b.estudianteIds.length - a.estudianteIds.length || HABILIDADES.indexOf(a.habilidad) - HABILIDADES.indexOf(b.habilidad));
}
