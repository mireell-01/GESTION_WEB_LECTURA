/** ÚNICO punto de entrada del módulo Gamificación desde otros módulos. */
export * from './gamificacion.module';
export { EVENTOS_GAMIFICACION } from './domain/events/eventos-gamificacion';
export { GamificacionFacade } from './application/gamificacion.facade';
export type { ParametrosVigentesVista, UmbralInsignia, VersionParametrosVista } from './application/use-cases/parametros-admin.use-case';
