import { RevisionUseCase } from './use-cases/revision.use-case';
import { SesionesUseCase } from './use-cases/sesiones.use-case';

/** Casos de uso de Lectura ensamblados en infrastructure/lectura.providers.ts. */
export interface CasosUsoLectura {
  sesiones: SesionesUseCase;
  revision: RevisionUseCase;
}

export const CASOS_USO_LECTURA = Symbol('CASOS_USO_LECTURA');
