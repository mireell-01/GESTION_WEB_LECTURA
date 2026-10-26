import type { Habilidad } from '../../../shared-kernel/public-api';
import { Celda, habilidadesEnInicio } from './mapa-calor';

/** RF-065: estudiante en riesgo con 7 días sin actividad o 2 habilidades (o más) en nivel C. */
export const DIAS_SIN_ACTIVIDAD = 7;
export const HABILIDADES_EN_INICIO_RIESGO = 2;

export type MotivoRiesgo = 'SIN_ACTIVIDAD' | 'HABILIDADES_EN_INICIO';

export interface Riesgo {
  enRiesgo: boolean;
  motivos: MotivoRiesgo[];
  /** Días desde su última actividad; null si todavía no tiene ninguna. */
  diasSinActividad: number | null;
  habilidadesEnInicio: Habilidad[];
}

const DIA_MS = 86_400_000;

/**
 * Sin actividad cuenta desde su última lectura o reto; quien nunca empezó, desde su matrícula (así un
 * aula recién creada no aparece entera en riesgo el primer día).
 */
export function evaluarRiesgo(p: { ultimaActividad: Date | null; matriculadoEn: Date; celdas: Celda[]; ahora: Date }): Riesgo {
  const referencia = p.ultimaActividad ?? p.matriculadoEn;
  const dias = Math.floor((p.ahora.getTime() - referencia.getTime()) / DIA_MS);
  const enInicio = habilidadesEnInicio(p.celdas);
  const motivos: MotivoRiesgo[] = [];
  if (dias >= DIAS_SIN_ACTIVIDAD) motivos.push('SIN_ACTIVIDAD');
  if (enInicio.length >= HABILIDADES_EN_INICIO_RIESGO) motivos.push('HABILIDADES_EN_INICIO');
  return {
    enRiesgo: motivos.length > 0,
    motivos,
    diasSinActividad: p.ultimaActividad ? Math.max(0, Math.floor((p.ahora.getTime() - p.ultimaActividad.getTime()) / DIA_MS)) : null,
    habilidadesEnInicio: enInicio,
  };
}
