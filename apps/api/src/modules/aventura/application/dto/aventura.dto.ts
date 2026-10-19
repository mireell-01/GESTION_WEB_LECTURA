import { AvanceLectura, Habilidad, RangoEdad } from '../../../shared-kernel/public-api';
import { EstadoMundo } from '../../domain/entities/progreso-aventura';
import { EstadoMision } from '../../domain/services/politica-progresion';

export type { EstadoMision, EstadoMundo };

/** RF-030: un mundo del mapa, tal como lo ve el estudiante. */
export interface MundoMapaVista {
  id: string;
  numero: number;
  nombre: string;
  descripcion: string;
  estado: EstadoMundo;
  habilidadesFoco: { codigo: Habilidad; nombre: string; maestria: number | null }[];
  misiones: { completadas: number; total: number; necesarias: number };
  /** RF-031: el niño aún no vio la celebración de este desbloqueo. */
  celebrar: boolean;
}

export interface MapaVista {
  /** RN-05: sin el diagnóstico inicial, el mapa no se habilita. */
  diagnosticoPendiente: boolean;
  mundoActual: number | null;
  mundos: MundoMapaVista[];
}

/** RF-032: una misión con sus lecturas y el avance del estudiante. */
export interface MisionEstudianteVista {
  id: string;
  orden: number;
  titulo: string;
  descripcion: string;
  estado: EstadoMision;
  lecturas: { id: string; titulo: string; nivelDificultad: number; avance: AvanceLectura | 'PENDIENTE' }[];
}

export interface MisionesDeMundoVista {
  mundo: { id: string; numero: number; nombre: string; descripcion: string; estado: EstadoMundo };
  misiones: MisionEstudianteVista[];
}

/** Backoffice: los 5 mundos con cuántas misiones tiene cada edad. */
export interface MundoBackofficeVista {
  id: string;
  numero: number;
  nombre: string;
  descripcion: string;
  habilidadesFoco: Habilidad[];
  misionesPorEdad: Record<RangoEdad, number>;
}

export interface MisionBackofficeVista {
  id: string;
  mundoId: string;
  rangoEdad: RangoEdad;
  orden: number;
  titulo: string;
  descripcion: string;
  /** `publicada: false` si la lectura se archivó después de armar la misión. */
  lecturas: { id: string; titulo: string; nivelDificultad: number | null; publicada: boolean }[];
}
