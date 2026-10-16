import { AventuraRepository } from '../../application/ports/aventura.repository';

/**
 * Adaptador secundario: PrismaAventuraRepository implements AventuraRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaAventuraRepository implements AventuraRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
