import { Habilidad, HABILIDADES, NivelCNEB, nivelDeclarado } from '../../../shared-kernel/public-api';

/** RF-063: una celda del mapa de calor estudiantes × habilidades. */
export interface Celda {
  habilidad: Habilidad;
  /** null: aún no tiene nada medido en esa habilidad (sin reto inicial ni lecturas). */
  valor: number | null;
  items: number;
  /** RN-08: nivel CNEB declarado con 5 ítems o más; null = "Aún descubriendo". */
  nivel: NivelCNEB | null;
}

export interface MaestriaMedida {
  habilidad: string;
  valor: number;
  items: number;
}

/** Las 5 celdas del estudiante, en el orden del SRS, a partir de lo que mide Progreso. */
export function celdasDe(medidas: MaestriaMedida[]): Celda[] {
  return HABILIDADES.map((habilidad) => {
    const m = medidas.find((x) => x.habilidad === habilidad);
    return m
      ? { habilidad, valor: Math.round(m.valor * 100) / 100, items: m.items, nivel: nivelDeclarado(m.valor, m.items) }
      : { habilidad, valor: null, items: 0, nivel: null };
  });
}

/** Habilidades en nivel C ("En inicio") declarado. */
export function habilidadesEnInicio(celdas: Celda[]): Habilidad[] {
  return celdas.filter((c) => c.nivel === 'C').map((c) => c.habilidad);
}
