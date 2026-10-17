import { CatalogoMisiones } from './catalogo-misiones';

/**
 * Vinculación puerto → adaptador (Dependency Injection).
 */
export const aventuraProviders = [
  // RF-018: misiones que el docente puede asignar.
  CatalogoMisiones,

  // Adaptadores de persistencia
  // { provide: AventuraRepository, useClass: PrismaAventuraRepository },
  // { provide: NodoRepository, useClass: PrismaNodoRepository },

  // Adaptador de mensajería
  // { provide: EventPublisher, useClass: OutboxEventPublisher },
];
