import { AuditoriaSuscripciones } from './auditoria-suscripciones';

/**
 * Vinculación puerto → adaptador (Dependency Injection).
 */
export const administracionProviders = [
  // RF-077: registra en admin.auditoria las acciones sensibles que anuncian los demás módulos.
  AuditoriaSuscripciones,

  // Adaptadores de persistencia
  // { provide: ConfiguracionRepository, useClass: PrismaConfiguracionRepository },
  // { provide: AuditoriaRepository, useClass: PrismaAuditoriaRepository },

  // Adaptador de mensajería
  // { provide: EventPublisher, useClass: OutboxEventPublisher },
];
