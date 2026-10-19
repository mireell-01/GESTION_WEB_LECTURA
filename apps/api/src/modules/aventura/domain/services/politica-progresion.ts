import { AvanceLectura, Habilidad, Maestrias } from '../../../shared-kernel/public-api';

/** RN-09 y RF-033: maestría mínima en las habilidades foco. */
export const UMBRAL_MAESTRIA = 65;
/** RN-09: misiones completadas en el mundo actual para desbloquear el siguiente. */
export const MISIONES_PARA_DESBLOQUEAR = 3;

/**
 * RF-033: con LIT y VOC ≥ 65 en el diagnóstico el estudiante empieza en el mundo 2 (el 1 queda
 * completado); si no, en el 1. Nunca empieza más allá del mundo 2.
 */
export function mundoInicial(maestrias: Maestrias | null): 1 | 2 {
  const lit = maestrias?.LIT ?? 0;
  const voc = maestrias?.VOC ?? 0;
  return lit >= UMBRAL_MAESTRIA && voc >= UMBRAL_MAESTRIA ? 2 : 1;
}

export interface EvaluacionDesbloqueo {
  cumple: boolean;
  /** Habilidades foco que aún no llegan a 65 (todas, si la maestría no se conoce). */
  habilidadesPendientes: Habilidad[];
  misionesFaltantes: number;
}

/** RN-09: todas las habilidades foco del mundo actual con maestría ≥ 65 y ≥ 3 misiones completadas en él. */
export function evaluarUmbral(foco: readonly Habilidad[], maestrias: Maestrias | null, misionesCompletadas: number): EvaluacionDesbloqueo {
  const habilidadesPendientes = foco.filter((h) => (maestrias?.[h] ?? 0) < UMBRAL_MAESTRIA);
  const misionesFaltantes = Math.max(0, MISIONES_PARA_DESBLOQUEAR - misionesCompletadas);
  return {
    cumple: maestrias !== null && habilidadesPendientes.length === 0 && misionesFaltantes === 0,
    habilidadesPendientes,
    misionesFaltantes,
  };
}

export const ESTADOS_MISION = ['PENDIENTE', 'EN_CURSO', 'COMPLETADA'] as const;
export type EstadoMision = (typeof ESTADOS_MISION)[number];

/** RF-032: completada cuando todas sus lecturas tienen sesión finalizada; en curso si alguna empezó. */
export function estadoSegunAvance(lecturaIds: readonly string[], avance: ReadonlyMap<string, AvanceLectura>): EstadoMision {
  if (lecturaIds.length === 0) return 'PENDIENTE';
  if (lecturaIds.every((id) => avance.get(id) === 'FINALIZADA')) return 'COMPLETADA';
  return lecturaIds.some((id) => avance.has(id)) ? 'EN_CURSO' : 'PENDIENTE';
}

/** Lo logrado no se pierde: el estado de una misión nunca retrocede (p. ej. si luego se le agrega una lectura). */
export function avanzarEstado(actual: EstadoMision, nuevo: EstadoMision): EstadoMision {
  return ESTADOS_MISION.indexOf(nuevo) > ESTADOS_MISION.indexOf(actual) ? nuevo : actual;
}
