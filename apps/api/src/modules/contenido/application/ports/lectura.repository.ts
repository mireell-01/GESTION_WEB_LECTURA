import { Lectura } from '../../domain/entities/lectura';
import { EstadoVersion, Recurso, VersionLectura } from '../../domain/entities/version-lectura';

/** Fila del listado del backoffice: una por lectura, con su versión más reciente. */
export interface ResumenLectura {
  lecturaId: string;
  versionId: string;
  numero: number;
  estado: EstadoVersion;
  titulo: string;
  rangoEdad: string;
  nivelDificultad: number;
  autorId: string;
  tienePublicada: boolean;
  archivada: boolean;
  actualizadaEn: Date;
}

export interface FiltroBiblioteca {
  rangos?: string[];
  niveles?: number[];
  tema?: string;
  tipo?: string;
  habilidad?: string;
  /** Posición opaca devuelta por la página anterior. */
  cursor?: string | null;
  limite: number;
}

/** Puerto de salida: persistencia de lecturas y sus versiones (con oraciones, actividades, recursos y nodos). */
export interface LecturaRepository {
  guardarLectura(lectura: Lectura): Promise<void>;
  buscarLectura(id: string): Promise<Lectura | null>;
  /** Un borrador se guarda completo; una versión enviada, publicada o archivada solo cambia su estado. */
  guardarVersion(version: VersionLectura): Promise<void>;
  buscarVersion(id: string): Promise<VersionLectura | null>;
  versionesDe(lecturaId: string): Promise<VersionLectura[]>;
  listarResumen(): Promise<ResumenLectura[]>;
  /** RF-028: versiones publicadas de lecturas vigentes, en orden estable para paginar. */
  biblioteca(filtro: FiltroBiblioteca): Promise<{ versiones: VersionLectura[]; siguiente: string | null }>;
  buscarRecurso(id: string): Promise<{ recurso: Recurso; versionId: string; estado: EstadoVersion } | null>;
}
