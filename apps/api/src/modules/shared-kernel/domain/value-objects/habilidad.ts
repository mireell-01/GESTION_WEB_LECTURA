/**
 * Value Object: Habilidad lectora (SRS §3.0).
 * LIT comprensión literal · INF inferencias · VOC vocabulario · CRI pensamiento crítico · ARG argumentación.
 */
export const HABILIDADES = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'] as const;

export type Habilidad = (typeof HABILIDADES)[number];

export const NOMBRE_HABILIDAD: Record<Habilidad, string> = {
  LIT: 'Comprensión literal',
  INF: 'Inferencias',
  VOC: 'Vocabulario',
  CRI: 'Pensamiento crítico',
  ARG: 'Argumentación',
};

export function esHabilidad(valor: unknown): valor is Habilidad {
  return typeof valor === 'string' && (HABILIDADES as readonly string[]).includes(valor);
}
