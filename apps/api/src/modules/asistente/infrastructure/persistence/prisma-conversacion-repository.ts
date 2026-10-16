import { ConversacionRepository } from '../../application/ports/conversacion.repository';

/**
 * Adaptador secundario: PrismaConversacionRepository implements ConversacionRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaConversacionRepository implements ConversacionRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
