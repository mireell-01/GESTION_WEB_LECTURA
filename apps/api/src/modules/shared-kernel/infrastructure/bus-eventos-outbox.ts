import { Injectable, Logger } from '@nestjs/common';

import { BusEventos, ManejadorEvento } from '../application/bus-eventos';
import { EventoDominio } from '../domain/events/domain-event';
import { PrismaService } from './prisma.service';
import { redactar } from './redaccion';
import { uuidV7 } from './uuid';

/**
 * Adaptador: BusEventosOutbox — persiste cada evento en `admin.outbox_evento` y lo despacha en proceso.
 * Si un manejador falla, el evento queda sin `publicadoEn` para reintentarse o auditarse.
 */
@Injectable()
export class BusEventosOutbox implements BusEventos {
  private readonly logger = new Logger('BusEventos');
  private readonly manejadores = new Map<string, ManejadorEvento<object>[]>();

  constructor(private readonly prisma: PrismaService) {}

  suscribir<T extends object>(nombreEvento: string, manejador: ManejadorEvento<T>): void {
    const lista = this.manejadores.get(nombreEvento) ?? [];
    lista.push(manejador as ManejadorEvento<object>);
    this.manejadores.set(nombreEvento, lista);
  }

  async publicar(eventos: EventoDominio<object>[]): Promise<void> {
    for (const evento of eventos) {
      const fila = await this.prisma.outboxEvento.create({
        data: {
          id: uuidV7(evento.ocurreEn.getTime()),
          tipo: evento.nombreEvento,
          agregadoId: evento.agregadoId,
          ocurrioEn: evento.ocurreEn,
          payload: JSON.parse(JSON.stringify(evento.datos)),
        },
      });

      let ok = true;
      for (const manejador of this.manejadores.get(evento.nombreEvento) ?? []) {
        try {
          await manejador(evento);
        } catch (error) {
          ok = false;
          // RNF-031: el mensaje de error puede incluir datos del evento; se redacta antes de registrarlo.
          this.logger.error(
            redactar(`Falló un manejador de ${evento.nombreEvento}: ${(error as Error).message}`),
            (error as Error).stack ? redactar((error as Error).stack as string) : undefined,
          );
        }
      }

      if (ok) {
        await this.prisma.outboxEvento.update({
          where: { id: fila.id },
          data: { publicadoEn: new Date() },
        });
      }
    }
  }
}
