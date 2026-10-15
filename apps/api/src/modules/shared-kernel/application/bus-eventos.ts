import { EventoDominio } from '../domain/events/domain-event';

/**
 * Puerto: BusEventos — publica eventos de dominio y permite que otros módulos se suscriban.
 * Los manejadores se ejecutan en el mismo proceso; el outbox deja constancia de cada evento.
 */
export type ManejadorEvento<T extends object = Record<string, unknown>> = (
  evento: EventoDominio<T>,
) => Promise<void>;

export interface BusEventos {
  publicar(eventos: EventoDominio<object>[]): Promise<void>;
  suscribir<T extends object>(nombreEvento: string, manejador: ManejadorEvento<T>): void;
}

export const BUS_EVENTOS = Symbol('BUS_EVENTOS');
