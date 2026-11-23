import { RecompensaNoEsTuyaError } from '../errors/errores-gamificacion';

/**
 * RF-062 (ampliado): lo que el niño tiene puesto. Un accesorio que luce en su avatar y un personaje
 * que lo acompaña al leer. Solo puede ponerse lo que ya canjeó; uno de cada tipo a la vez.
 */
export interface Apariencia {
  accesorioId: string | null;
  personajeId: string | null;
}

export const SIN_APARIENCIA: Apariencia = Object.freeze({ accesorioId: null, personajeId: null });

/** Se pone la recompensa (si es suya) en lugar de la del mismo tipo que tenía puesta. */
export function ponerse(actual: Apariencia, recompensa: { id: string; tipo: 'PERSONAJE' | 'ACCESORIO' }, esSuya: boolean): Apariencia {
  if (!esSuya) throw new RecompensaNoEsTuyaError();
  return recompensa.tipo === 'ACCESORIO' ? { ...actual, accesorioId: recompensa.id } : { ...actual, personajeId: recompensa.id };
}

/** Se quita la recompensa; si no la tenía puesta, nada cambia. */
export function quitarse(actual: Apariencia, recompensaId: string): Apariencia {
  return {
    accesorioId: actual.accesorioId === recompensaId ? null : actual.accesorioId,
    personajeId: actual.personajeId === recompensaId ? null : actual.personajeId,
  };
}
