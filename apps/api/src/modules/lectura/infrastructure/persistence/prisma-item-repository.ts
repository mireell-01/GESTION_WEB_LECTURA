import { ItemRepository } from '../../application/ports/item.repository';

/**
 * Adaptador secundario: PrismaItemRepository implements ItemRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaItemRepository implements ItemRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
