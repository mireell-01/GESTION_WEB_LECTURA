import { Global, Module } from '@nestjs/common';

import { BUS_EVENTOS } from './application/bus-eventos';
import { RECOLECTOR_DATOS } from './application/recolector-datos';
import { BusEventosOutbox } from './infrastructure/bus-eventos-outbox';
import { PrismaService } from './infrastructure/prisma.service';
import { RecolectorDatosMemoria } from './infrastructure/recolector-datos-memoria';

/**
 * Shared Kernel: abstracciones compartidas entre módulos (eventos, persistencia, autorización).
 * Es global para que cada módulo reciba PrismaService, el bus y el recolector sin importarlo.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    BusEventosOutbox,
    { provide: BUS_EVENTOS, useExisting: BusEventosOutbox },
    { provide: RECOLECTOR_DATOS, useClass: RecolectorDatosMemoria },
  ],
  exports: [PrismaService, BUS_EVENTOS, RECOLECTOR_DATOS],
})
export class SharedKernelModule {}
