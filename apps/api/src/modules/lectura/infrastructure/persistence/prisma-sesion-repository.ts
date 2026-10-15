import { SesionRepository } from '../../application/ports/sesion.repository';

/**
 * Adaptador secundario: PrismaSesionRepository implements SesionRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaSesionRepository implements SesionRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
