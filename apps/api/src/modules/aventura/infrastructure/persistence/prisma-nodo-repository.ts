import { NodoRepository } from '../../application/ports/nodo.repository';

/**
 * Adaptador secundario: PrismaNodoRepository implements NodoRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaNodoRepository implements NodoRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
