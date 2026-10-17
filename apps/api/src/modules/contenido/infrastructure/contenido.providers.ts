import { CatalogoLecturas } from './catalogo-lecturas';

/**
 * Vinculación puerto → adaptador (Dependency Injection).
 */
export const contenidoProviders = [
  // RF-018: lecturas publicadas que el docente puede asignar.
  CatalogoLecturas,

  // Adaptadores de persistencia
  // { provide: TextoRepository, useClass: PrismaTextoRepository },
  // { provide: CategoriaRepository, useClass: PrismaCategoriaRepository },

  // Adaptador de mensajería
  // { provide: EventPublisher, useClass: OutboxEventPublisher },
];
