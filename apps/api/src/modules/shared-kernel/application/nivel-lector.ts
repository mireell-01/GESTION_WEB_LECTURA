/**
 * Puerto: ResolutorNivelLector — nivel de dificultad (1–5) en que lee hoy un estudiante. Lo calcula
 * Progreso (perfil lector, RF-052) a partir del diagnóstico; mientras no esté, no hay dato y cada
 * módulo usa su valor por defecto. Progreso registrará su implementación al iniciar (sin ciclos).
 */
export interface ResolutorNivelLector {
  nivelDe(estudianteId: string): Promise<number | null>;
}

export interface RegistroNivelLector extends ResolutorNivelLector {
  registrar(resolutor: ResolutorNivelLector): void;
}

export const NIVEL_LECTOR = Symbol('NIVEL_LECTOR');
