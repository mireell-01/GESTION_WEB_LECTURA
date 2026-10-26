/**
 * Puertos que Gamificación (Módulo 8) necesita para el Pasaporte del Lector (RF-059): las lecturas que
 * terminó (Lectura) y los mundos que completó (Aventura). Cada módulo registra su implementación al
 * iniciar; mientras no exista, el registro responde una lista vacía.
 */

/** Una lectura terminada al menos una vez (RF-047), con su primer cierre. */
export interface LecturaRealizada {
  lecturaId: string;
  finalizadaEn: Date;
}

export interface ResolutorLecturasRealizadas {
  /** De la más reciente a la más antigua. */
  realizadasDe(estudianteId: string): Promise<LecturaRealizada[]>;
}

export interface RegistroLecturasRealizadas extends ResolutorLecturasRealizadas {
  registrar(resolutor: ResolutorLecturasRealizadas): void;
}

export const LECTURAS_REALIZADAS = Symbol('LECTURAS_REALIZADAS');

/** Un mundo del mapa en estado COMPLETADO (RF-031); el reto inicial también completa los anteriores (RF-033). */
export interface MundoCompletado {
  numero: number;
  nombre: string;
  completadoEn: Date | null;
}

export interface ResolutorMundosCompletados {
  /** En el orden del mapa. */
  completadosDe(estudianteId: string): Promise<MundoCompletado[]>;
}

export interface RegistroMundosCompletados extends ResolutorMundosCompletados {
  registrar(resolutor: ResolutorMundosCompletados): void;
}

export const MUNDOS_COMPLETADOS = Symbol('MUNDOS_COMPLETADOS');
