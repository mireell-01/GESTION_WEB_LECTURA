import { GamificacionFacade } from './gamificacion.facade';
import { LogrosUseCase } from './use-cases/logros.use-case';
import { PasaporteUseCase } from './use-cases/pasaporte.use-case';

/** Casos de uso de Gamificación que ensambla el composition root y usan la interfaz y las suscripciones. */
export interface CasosUsoGamificacion {
  logros: LogrosUseCase;
  pasaporte: PasaporteUseCase;
  /** RF-078 (Módulo 12). */
  facade: GamificacionFacade;
}

export const CASOS_USO_GAMIFICACION = Symbol('CASOS_USO_GAMIFICACION');
