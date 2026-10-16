import { SugerenciaRepository } from '../../application/ports/sugerencia.repository';

/**
 * Adaptador secundario: PrismaSugerenciaRepository implements SugerenciaRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaSugerenciaRepository implements SugerenciaRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
