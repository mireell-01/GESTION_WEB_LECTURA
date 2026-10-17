/** ÚNICO punto de entrada del módulo Escuela desde otros módulos. */
export * from './escuela.module';
export { EscuelaFacade } from './application/escuela.facade';
export type { AulaResumen } from './application/escuela.facade';
export type { MisionDelDocenteVista } from './application/dto/escuela.dto';
export { EVENTOS_ESCUELA } from './domain/events/eventos-escuela';
