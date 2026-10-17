import { AutoriaUseCase } from './use-cases/autoria.use-case';
import { BibliotecaUseCase } from './use-cases/biblioteca.use-case';
import { PublicacionUseCase } from './use-cases/publicacion.use-case';
import { RecursosUseCase } from './use-cases/recursos.use-case';

/** Casos de uso de Contenido ensamblados en infrastructure/contenido.providers.ts. */
export interface CasosUsoContenido {
  autoria: AutoriaUseCase;
  publicacion: PublicacionUseCase;
  recursos: RecursosUseCase;
  biblioteca: BibliotecaUseCase;
}

export const CASOS_USO_CONTENIDO = Symbol('CASOS_USO_CONTENIDO');
