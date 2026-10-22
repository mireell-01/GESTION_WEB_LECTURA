import { RangoEdad } from '../../../shared-kernel/public-api';
import { EstadoRespuesta, SesionLectura } from '../../domain/entities/sesion-lectura';
import { ContenidoLectura } from '../../domain/value-objects/contenido-lectura';

/** Persistencia de las sesiones con sus respuestas, pistas, justificaciones, decisiones y valoraciones (schema `lectura`). */
export interface SesionRepository {
  buscar(id: string): Promise<SesionLectura | null>;
  buscarPorRespuesta(respuestaId: string): Promise<SesionLectura | null>;
  /** La sesión sin terminar del estudiante en esa lectura (a lo sumo una). */
  activaDe(estudianteId: string, lecturaId: string): Promise<SesionLectura | null>;
  /** false si un pedido simultáneo ya abrió otra sesión para esa lectura. */
  crear(sesion: SesionLectura): Promise<boolean>;
  guardar(sesion: SesionLectura): Promise<void>;
  tieneFinalizada(estudianteId: string, lecturaId: string): Promise<boolean>;
  /** Para Aventura (RF-032): terminadas, o en curso con actividad desde `activaDesde`. */
  avanceDe(estudianteId: string, lecturaIds: string[], activaDesde: Date): Promise<Map<string, 'EN_CURSO' | 'FINALIZADA'>>;
  /** RF-051: sesiones de esos estudiantes con respuestas abiertas en ese estado. */
  conRespuestasAbiertas(estudianteIds: string[], estado: EstadoRespuesta): Promise<SesionLectura[]>;
}

/** Anticorrupción hacia Contenido: versiones publicadas, inmutables (RN-14). */
export interface ContenidoLecturas {
  /** La versión publicada vigente de la lectura (null si no está publicada o se archivó). */
  publicada(lecturaId: string): Promise<ContenidoLectura | null>;
  /** Una versión ya publicada: la de una sesión en curso, aunque después se haya publicado otra. */
  version(versionId: string): Promise<ContenidoLectura | null>;
}

/** Anticorrupción hacia IAM. */
export interface IdentidadEstudiantes {
  perfiles(ids: string[]): Promise<{ id: string; alias: string; avatar: string; rangoEdad: RangoEdad; activo: boolean }[]>;
}

/** Anticorrupción hacia Escuela. */
export interface EscuelaLectura {
  /** RN-19: con docente, las respuestas abiertas pasan a su revisión. */
  tieneDocente(estudianteId: string): Promise<boolean>;
  /** RF-018: la asignación está en curso para el estudiante y es de esa lectura. */
  asignacionDeLectura(estudianteId: string, asignacionId: string, lecturaId: string): Promise<boolean>;
  /** RN-17: null si el aula no existe o no es del docente. */
  aulaDelDocente(docenteId: string, aulaId: string): Promise<{ id: string; nombre: string } | null>;
  estudiantes(aulaId: string): Promise<string[]>;
  docenteAccedeAEstudiante(docenteId: string, estudianteId: string): Promise<boolean>;
}
