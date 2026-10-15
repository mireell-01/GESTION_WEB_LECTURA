import { HitoRepository } from '../../application/ports/hito.repository';

/**
 * Adaptador secundario: PrismaHitoRepository implements HitoRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaHitoRepository implements HitoRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
