import { Habilidad, RangoEdad } from '../../../shared-kernel/public-api';

export const TIPOS_DIAGNOSTICO = ['INICIAL', 'REEVALUACION'] as const;
export type TipoDiagnostico = (typeof TIPOS_DIAGNOSTICO)[number];

/** SRS §3.5: NO_INICIADO → EN_CURSO ⇄ PAUSADO → FINALIZADO. */
export type EstadoDiagnostico = 'NO_INICIADO' | 'EN_CURSO' | 'PAUSADO' | 'FINALIZADO';

export type Forma = 'A' | 'B';

/** RF-034: 15 ítems (R1: 10), distribuidos por igual en las 5 habilidades. */
export const ITEMS_POR_RANGO: Record<RangoEdad, 10 | 15> = { R1: 10, R2: 15, R3: 15 };

/** Orden en que se presentan las habilidades dentro de cada lectura del banco. */
export const ORDEN_HABILIDADES: readonly Habilidad[] = ['LIT', 'VOC', 'INF', 'CRI', 'ARG'];

/**
 * RF-037: la reevaluación usa ítems equivalentes, alternando formas: el inicial es la forma A, la
 * primera reevaluación la B, la segunda otra vez la A, y así. Las dos formas tienen la misma
 * estructura y dificultad, por eso los resultados son comparables.
 */
export function formaDe(tipo: TipoDiagnostico, secuencia: number): Forma {
  if (tipo === 'INICIAL') return 'A';
  return secuencia % 2 === 1 ? 'B' : 'A';
}
