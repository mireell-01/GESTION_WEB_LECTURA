/** ÚNICO punto de entrada del módulo contenido desde otros módulos. */
export * from './contenido.module';
export { ContenidoFacade } from './application/contenido.facade';
export type { VersionParaLeer } from './application/contenido.facade';
export { EVENTOS_CONTENIDO } from './domain/events/eventos-contenido';
