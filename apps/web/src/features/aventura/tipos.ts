import type { TonoMundo } from '@lectoaventura/ui';

/** Tipos de las respuestas de Aventura que usa la web (RF-030 a RF-033) y sus nombres en pantalla. */

export type EstadoMundo = 'BLOQUEADO' | 'DISPONIBLE' | 'COMPLETADO';
export type EstadoMision = 'PENDIENTE' | 'EN_CURSO' | 'COMPLETADA';
export type RangoEdad = 'R1' | 'R2' | 'R3';

export interface MundoMapa {
  id: string;
  numero: number;
  nombre: string;
  descripcion: string;
  estado: EstadoMundo;
  habilidadesFoco: { codigo: string; nombre: string; maestria: number | null }[];
  misiones: { completadas: number; total: number; necesarias: number };
  celebrar: boolean;
}

export interface Mapa {
  diagnosticoPendiente: boolean;
  mundoActual: number | null;
  mundos: MundoMapa[];
}

export interface MisionEstudiante {
  id: string;
  orden: number;
  titulo: string;
  descripcion: string;
  estado: EstadoMision;
  lecturas: { id: string; titulo: string; nivelDificultad: number; avance: 'PENDIENTE' | 'EN_CURSO' | 'FINALIZADA' }[];
}

export interface MisionesDeMundo {
  mundo: { id: string; numero: number; nombre: string; descripcion: string; estado: EstadoMundo };
  misiones: MisionEstudiante[];
}

export interface MundoBackoffice {
  id: string;
  numero: number;
  nombre: string;
  descripcion: string;
  habilidadesFoco: string[];
  misionesPorEdad: Record<RangoEdad, number>;
}

export interface MisionBackoffice {
  id: string;
  mundoId: string;
  rangoEdad: RangoEdad;
  orden: number;
  titulo: string;
  descripcion: string;
  lecturas: { id: string; titulo: string; nivelDificultad: number | null; publicada: boolean }[];
}

export interface FichaLectura {
  id: string;
  titulo: string;
  rangoEdad: RangoEdad;
  nivelDificultad: number;
  tematica: string;
}

/** Ilustración de cada mundo (la misma del inicio del estudiante). */
export const TONO_MUNDO: Record<number, TonoMundo> = { 1: 'bosque', 2: 'valle', 3: 'montana', 4: 'desierto', 5: 'cielo' };

export const EDADES: Record<RangoEdad, string> = { R1: '6–7 años', R2: '8–9 años', R3: '10–12 años' };

export const HABILIDADES: Record<string, string> = {
  LIT: 'Comprensión literal',
  INF: 'Inferencias',
  VOC: 'Vocabulario',
  CRI: 'Pensamiento crítico',
  ARG: 'Argumentación',
};

export const ESTADO_MISION: Record<EstadoMision, { texto: string; chip: 'info' | 'aviso' | 'exito' }> = {
  PENDIENTE: { texto: 'Por empezar', chip: 'info' },
  EN_CURSO: { texto: 'En curso', chip: 'aviso' },
  COMPLETADA: { texto: 'Completada', chip: 'exito' },
};
