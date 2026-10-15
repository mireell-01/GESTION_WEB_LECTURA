import { InsigniaRepository } from '../../application/ports/insignia.repository';

/**
 * Adaptador secundario: PrismaInsigniaRepository implements InsigniaRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaInsigniaRepository implements InsigniaRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
