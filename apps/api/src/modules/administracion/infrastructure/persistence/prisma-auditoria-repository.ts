import { AuditoriaRepository } from '../../application/ports/auditoria.repository';

/**
 * Adaptador secundario: PrismaAuditoriaRepository implements AuditoriaRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaAuditoriaRepository implements AuditoriaRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
