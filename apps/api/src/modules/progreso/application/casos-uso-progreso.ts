import { PerfilLectorUseCase } from './use-cases/perfil-lector.use-case';
import { RecomendacionesUseCase } from './use-cases/recomendaciones.use-case';

/** Casos de uso de Progreso ensamblados en infrastructure/progreso.providers.ts. */
export interface CasosUsoProgreso {
  perfil: PerfilLectorUseCase;
  recomendaciones: RecomendacionesUseCase;
}

export const CASOS_USO_PROGRESO = Symbol('CASOS_USO_PROGRESO');
