import { TextoRepository } from '../../application/ports/texto.repository';

/**
 * Adaptador secundario: PrismaTextoRepository implements TextoRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaTextoRepository implements TextoRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
