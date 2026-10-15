import { EventPublisher } from '../../application/ports/event-publisher';

/**
 * Adaptador secundario: OutboxEventPublisher — patrón Outbox transaccional.
 */
export class OutboxEventPublisher implements EventPublisher {
  async publicar(_eventos: unknown[]): Promise<void> {
    void _eventos;
    throw new Error('TODO: implementar OutboxEventPublisher');
  }
}
