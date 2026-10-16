import { PuntajeRepository } from '../../application/ports/puntaje.repository';

/**
 * Adaptador secundario: PrismaPuntajeRepository implements PuntajeRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaPuntajeRepository implements PuntajeRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
