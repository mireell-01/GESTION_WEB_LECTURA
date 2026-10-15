import { ProgresoRepository } from '../../application/ports/progreso.repository';

/**
 * Adaptador secundario: PrismaProgresoRepository implements ProgresoRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaProgresoRepository implements ProgresoRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
