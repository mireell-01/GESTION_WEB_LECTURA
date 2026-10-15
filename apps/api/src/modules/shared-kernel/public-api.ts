/** ÚNICO punto de entrada al shared-kernel desde otros módulos. */
export * from './shared-kernel.module';
export * from './domain/events/domain-event';
export * from './domain/errors/error-de-negocio';
export * from './domain/ids';
export * from './domain/value-objects';
export * from './application/bus-eventos';
export * from './application/contexto-aula';
export * from './application/recolector-datos';
export * from './infrastructure/prisma.service';
export * from './infrastructure/redaccion';
export * from './interface/autorizacion';
export * from './interface/filtro-errores';
export * from './interface/id-peticion';
export * from './interface/limite-tasa';
