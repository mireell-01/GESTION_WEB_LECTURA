import { LogrosUseCase } from './use-cases/logros.use-case';
import { PasaporteUseCase } from './use-cases/pasaporte.use-case';

/** Casos de uso de Gamificación que ensambla el composition root y usan la interfaz y las suscripciones. */
export interface CasosUsoGamificacion {
  logros: LogrosUseCase;
  pasaporte: PasaporteUseCase;
}

export const CASOS_USO_GAMIFICACION = Symbol('CASOS_USO_GAMIFICACION');
