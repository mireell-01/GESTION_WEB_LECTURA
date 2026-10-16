import { ResultadoRepository } from '../../application/ports/resultado.repository';

/**
 * Adaptador secundario: PrismaResultadoRepository implements ResultadoRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaResultadoRepository implements ResultadoRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
