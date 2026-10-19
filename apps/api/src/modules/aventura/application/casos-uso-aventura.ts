import { MapaUseCase } from './use-cases/mapa.use-case';
import { MisionesBackofficeUseCase } from './use-cases/misiones-backoffice.use-case';
import { ProgresoUseCase } from './use-cases/progreso.use-case';

/** Casos de uso de Aventura ensamblados en infrastructure/aventura.providers.ts. */
export interface CasosUsoAventura {
  mapa: MapaUseCase;
  progreso: ProgresoUseCase;
  misiones: MisionesBackofficeUseCase;
}

export const CASOS_USO_AVENTURA = Symbol('CASOS_USO_AVENTURA');
