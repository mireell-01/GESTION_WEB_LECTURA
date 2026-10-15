import { ConfiguracionRepository } from '../../application/ports/configuracion.repository';

/**
 * Adaptador secundario: PrismaConfiguracionRepository implements ConfiguracionRepository.
 * Conecta el puerto con Prisma ORM.
 */
export class PrismaConfiguracionRepository implements ConfiguracionRepository {
  // TODO: inyectar PrismaClient e implementar los métodos del puerto
}
