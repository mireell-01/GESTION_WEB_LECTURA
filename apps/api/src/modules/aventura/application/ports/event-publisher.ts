/**
 * Puerto de salida: EventPublisher — publica eventos de dominio (patrón Outbox).
 */
export interface EventPublisher {
  publicar(eventos: unknown[]): Promise<void>;
}
