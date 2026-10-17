import { Global, Module } from '@nestjs/common';

import { BUS_EVENTOS } from './application/bus-eventos';
import { CATALOGO_ASIGNABLE } from './application/catalogo-asignable';
import { CONTEXTO_AULA } from './application/contexto-aula';
import { NIVEL_LECTOR } from './application/nivel-lector';
import { RECOLECTOR_DATOS } from './application/recolector-datos';
import { BusEventosOutbox } from './infrastructure/bus-eventos-outbox';
import { RegistroCatalogoAsignableMemoria } from './infrastructure/catalogo-asignable-registro';
import { RegistroContextoAulaDelegado } from './infrastructure/contexto-aula-registro';
import { RegistroNivelLectorDelegado } from './infrastructure/nivel-lector-registro';
import { PrismaService } from './infrastructure/prisma.service';
import { RecolectorDatosMemoria } from './infrastructure/recolector-datos-memoria';

/**
 * Shared Kernel: abstracciones compartidas entre módulos (eventos, persistencia, autorización,
 * contexto de aula, catálogo asignable). Es global para que cada módulo las reciba sin importarlo.
 */
@Global()
@Module({
  providers: [
    PrismaService,
    BusEventosOutbox,
    { provide: BUS_EVENTOS, useExisting: BusEventosOutbox },
    { provide: RECOLECTOR_DATOS, useClass: RecolectorDatosMemoria },
    { provide: CONTEXTO_AULA, useClass: RegistroContextoAulaDelegado },
    { provide: CATALOGO_ASIGNABLE, useClass: RegistroCatalogoAsignableMemoria },
    { provide: NIVEL_LECTOR, useClass: RegistroNivelLectorDelegado },
  ],
  exports: [PrismaService, BUS_EVENTOS, RECOLECTOR_DATOS, CONTEXTO_AULA, CATALOGO_ASIGNABLE, NIVEL_LECTOR],
})
export class SharedKernelModule {}
