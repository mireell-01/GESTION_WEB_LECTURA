import { AsistenciaLecturaUseCase } from './use-cases/asistencia.use-case';
import { HistorialUseCase } from './use-cases/historial.use-case';
import { RevisionUseCase } from './use-cases/revision.use-case';
import { SesionesUseCase } from './use-cases/sesiones.use-case';

/** Casos de uso de Lectura ensamblados en infrastructure/lectura.providers.ts. */
export interface CasosUsoLectura {
  sesiones: SesionesUseCase;
  revision: RevisionUseCase;
  /** Módulo 9: las últimas sesiones para el detalle docente (RF-064). */
  historial: HistorialUseCase;
  /** Módulo 11: la pregunta en curso para el asistente y las respuestas abiertas para su borrador. */
  asistencia: AsistenciaLecturaUseCase;
}

export const CASOS_USO_LECTURA = Symbol('CASOS_USO_LECTURA');
