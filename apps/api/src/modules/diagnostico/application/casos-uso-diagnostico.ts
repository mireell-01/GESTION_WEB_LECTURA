import { ReevaluacionesUseCase } from './use-cases/reevaluaciones.use-case';
import { RetoUseCase } from './use-cases/reto.use-case';

/** Casos de uso del Diagnóstico ensamblados en infrastructure/diagnostico.providers.ts. */
export interface CasosUsoDiagnostico {
  reto: RetoUseCase;
  reevaluaciones: ReevaluacionesUseCase;
}

export const CASOS_USO_DIAGNOSTICO = Symbol('CASOS_USO_DIAGNOSTICO');
