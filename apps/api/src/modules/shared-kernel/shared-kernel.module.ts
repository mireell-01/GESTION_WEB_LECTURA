import { Global, Module } from '@nestjs/common';

import { BUS_EVENTOS } from './application/bus-eventos';
import { CATALOGO_ASIGNABLE } from './application/catalogo-asignable';
import { CONTEXTO_AULA } from './application/contexto-aula';
import { FICHAS_LECTURA } from './application/fichas-lectura';
import { NIVEL_LECTOR } from './application/nivel-lector';
import { AVANCE_LECTURAS, DIAGNOSTICO_INICIAL, MAESTRIA_LECTOR } from './application/progreso-lector';
import { RECOLECTOR_DATOS } from './application/recolector-datos';
import { BusEventosOutbox } from './infrastructure/bus-eventos-outbox';
import { RegistroCatalogoAsignableMemoria } from './infrastructure/catalogo-asignable-registro';
import { RegistroContextoAulaDelegado } from './infrastructure/contexto-aula-registro';
import { RegistroNivelLectorDelegado } from './infrastructure/nivel-lector-registro';
import { PrismaService } from './infrastructure/prisma.service';
import { RecolectorDatosMemoria } from './infrastructure/recolector-datos-memoria';
import {
  RegistroAvanceLecturasDelegado,
  RegistroDiagnosticoInicialDelegado,
  RegistroFichasLecturaDelegado,
  RegistroMaestriaDelegado,
} from './infrastructure/registros-integracion';

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
    // Módulo 4: lo que Aventura necesita de Contenido y de los Módulos 5, 6 y 7.
    { provide: FICHAS_LECTURA, useClass: RegistroFichasLecturaDelegado },
    { provide: DIAGNOSTICO_INICIAL, useClass: RegistroDiagnosticoInicialDelegado },
    { provide: MAESTRIA_LECTOR, useClass: RegistroMaestriaDelegado },
    { provide: AVANCE_LECTURAS, useClass: RegistroAvanceLecturasDelegado },
  ],
  exports: [
    PrismaService,
    BUS_EVENTOS,
    RECOLECTOR_DATOS,
    CONTEXTO_AULA,
    CATALOGO_ASIGNABLE,
    NIVEL_LECTOR,
    FICHAS_LECTURA,
    DIAGNOSTICO_INICIAL,
    MAESTRIA_LECTOR,
    AVANCE_LECTURAS,
  ],
})
export class SharedKernelModule {}
