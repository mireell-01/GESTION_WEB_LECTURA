import { CategoriaRepository } from '../../application/ports/categoria.repository';

/**
 * Adaptador secundario: PrismaCategoriaRepository implements CategoriaRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaCategoriaRepository implements CategoriaRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
