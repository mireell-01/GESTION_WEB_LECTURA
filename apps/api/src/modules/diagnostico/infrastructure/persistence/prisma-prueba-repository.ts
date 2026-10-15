import { PruebaRepository } from '../../application/ports/prueba.repository';

/**
 * Adaptador secundario: PrismaPruebaRepository implements PruebaRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaPruebaRepository implements PruebaRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
