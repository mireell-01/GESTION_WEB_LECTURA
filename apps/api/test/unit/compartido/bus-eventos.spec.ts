import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { crearEvento } from '../../../src/modules/shared-kernel/public-api';
import { BusEventosOutbox } from '../../../src/modules/shared-kernel/infrastructure/bus-eventos-outbox';
import { PrismaService } from '../../../src/modules/shared-kernel/infrastructure/prisma.service';

/**
 * Nivel 1 — El bus de eventos (outbox en proceso): guarda cada evento, despacha a sus manejadores en el orden
 * en que se suscribieron y lo marca publicado solo si todos terminan bien; los eventos de una lista, en orden.
 */
function outboxFalso() {
  const filas: { id: string; tipo: string; publicadoEn: Date | null }[] = [];
  const prisma = {
    outboxEvento: {
      create: vi.fn(async ({ data }: { data: { id: string; tipo: string } }) => {
        filas.push({ id: data.id, tipo: data.tipo, publicadoEn: null });
        return { id: data.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { publicadoEn: Date } }) => {
        const fila = filas.find((f) => f.id === where.id);
        if (fila) fila.publicadoEn = data.publicadoEn;
        return fila;
      }),
    },
  };
  return { filas, bus: new BusEventosOutbox(prisma as unknown as PrismaService) };
}

const evento = (nombre = 'lectura.ItemRespondido', datos: object = { estudianteId: 'nino-1' }) => crearEvento(nombre, 'nino-1', datos);

describe('[Compartido][Menor][Fast] Bus de eventos con outbox', () => {
  let errores: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errores = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('guarda el evento y, si sus manejadores terminan bien, lo marca publicado', async () => {
    const { filas, bus } = outboxFalso();
    const recibidos: string[] = [];
    bus.suscribir('lectura.ItemRespondido', async (e) => void recibidos.push(e.agregadoId));
    await bus.publicar([evento()]);
    expect(recibidos).toEqual(['nino-1']);
    expect(filas).toHaveLength(1);
    expect(filas[0]?.publicadoEn).toBeInstanceOf(Date);
  });

  it('despacha a los manejadores de un evento en el orden en que se suscribieron, uno tras otro', async () => {
    const { bus } = outboxFalso();
    const traza: string[] = [];
    bus.suscribir('lectura.ItemRespondido', async () => {
      traza.push('progreso empieza');
      await new Promise((ok) => setTimeout(ok, 10));
      traza.push('progreso termina');
    });
    bus.suscribir('lectura.ItemRespondido', async () => void traza.push('gamificación'));
    await bus.publicar([evento()]);
    expect(traza).toEqual(['progreso empieza', 'progreso termina', 'gamificación']);
  });

  it('si un manejador falla, los demás igual corren, el evento queda sin publicar y el error se registra redactado', async () => {
    const { filas, bus } = outboxFalso();
    let otroCorrio = false;
    bus.suscribir('lectura.ItemRespondido', async () => {
      throw new Error('se cayó con pin=4826');
    });
    bus.suscribir('lectura.ItemRespondido', async () => {
      otroCorrio = true;
    });
    await bus.publicar([evento()]);
    expect(otroCorrio).toBe(true);
    expect(filas[0]?.publicadoEn).toBeNull();
    expect(errores).toHaveBeenCalledTimes(1);
    expect(String(errores.mock.calls[0]?.[0])).toContain('Falló un manejador de lectura.ItemRespondido');
    expect(String(errores.mock.calls[0]?.[0])).not.toContain('4826');
  });

  it('los eventos de una lista se despachan en orden: cada uno termina antes de que empiece el siguiente', async () => {
    const { filas, bus } = outboxFalso();
    const traza: string[] = [];
    bus.suscribir('a', async () => {
      traza.push('a empieza');
      await new Promise((ok) => setTimeout(ok, 10));
      traza.push('a termina');
    });
    bus.suscribir('b', async () => void traza.push('b'));
    await bus.publicar([evento('a'), evento('b')]);
    expect(traza).toEqual(['a empieza', 'a termina', 'b']);
    expect(filas.map((f) => f.tipo)).toEqual(['a', 'b']);
  });

  it('un evento sin manejadores igual queda guardado y publicado', async () => {
    const { filas, bus } = outboxFalso();
    await bus.publicar([evento('nadie.loEscucha')]);
    expect(filas[0]?.publicadoEn).toBeInstanceOf(Date);
  });
});
