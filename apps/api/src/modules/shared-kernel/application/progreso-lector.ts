import type { Habilidad } from '../domain/value-objects/habilidad';

/**
 * Puertos que Aventura (Módulo 4) necesita de módulos posteriores. Cada módulo registra su
 * implementación al iniciar; mientras no exista, el registro responde un valor neutro y Aventura
 * aplica el comportamiento documentado (docs/datos/modelo-de-datos.md).
 */

/** Maestría (0–100) por habilidad. */
export type Maestrias = Partial<Record<Habilidad, number>>;

/**
 * Diagnóstico inicial (Módulo 5, RF-034 a RF-036). RN-05: el mapa no se habilita sin él.
 * `SIN_MODULO`: el diagnóstico todavía no existe en la plataforma.
 */
export type ResultadoDiagnosticoInicial =
  | { estado: 'SIN_MODULO' }
  | { estado: 'PENDIENTE' }
  | { estado: 'FINALIZADO'; maestrias: Maestrias };

export interface ResolutorDiagnosticoInicial {
  resultadoDe(estudianteId: string): Promise<ResultadoDiagnosticoInicial>;
}

export interface RegistroDiagnosticoInicial extends ResolutorDiagnosticoInicial {
  registrar(resolutor: ResolutorDiagnosticoInicial): void;
}

export const DIAGNOSTICO_INICIAL = Symbol('DIAGNOSTICO_INICIAL');

/** Maestría actual del perfil lector (Módulo 7, RN-07). Sin Progreso, no hay dato (`null`). */
export interface ResolutorMaestria {
  maestriasDe(estudianteId: string): Promise<Maestrias | null>;
}

export interface RegistroMaestria extends ResolutorMaestria {
  registrar(resolutor: ResolutorMaestria): void;
}

export const MAESTRIA_LECTOR = Symbol('MAESTRIA_LECTOR');

/** Avance del estudiante en cada lectura (Módulo 6, sesiones de lectura). Sin sesiones, nada empezó. */
export type AvanceLectura = 'EN_CURSO' | 'FINALIZADA';

export interface ResolutorAvanceLecturas {
  /** Solo incluye las lecturas que el estudiante empezó o terminó. */
  avanceDe(estudianteId: string, lecturaIds: string[]): Promise<Map<string, AvanceLectura>>;
}

export interface RegistroAvanceLecturas extends ResolutorAvanceLecturas {
  registrar(resolutor: ResolutorAvanceLecturas): void;
}

export const AVANCE_LECTURAS = Symbol('AVANCE_LECTURAS');
