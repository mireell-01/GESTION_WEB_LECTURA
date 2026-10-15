import { Module } from '@nestjs/common';

import { SharedKernelModule } from './modules/shared-kernel/public-api';
import { LecturaModule } from './modules/lectura/public-api';
import { IamModule } from './modules/iam/public-api';
import { EscuelaModule } from './modules/escuela/public-api';
import { ContenidoModule } from './modules/contenido/public-api';
import { AventuraModule } from './modules/aventura/public-api';
import { DiagnosticoModule } from './modules/diagnostico/public-api';
import { ProgresoModule } from './modules/progreso/public-api';
import { GamificacionModule } from './modules/gamificacion/public-api';
import { AsistenteModule } from './modules/asistente/public-api';
import { AdministracionModule } from './modules/administracion/public-api';

/**
 * Ensamblaje de módulos (composition root secundario).
 * Cada módulo se importa SOLO desde su public-api.ts.
 */
@Module({
  imports: [
    SharedKernelModule,
    IamModule,
    EscuelaModule,
    ContenidoModule,
    LecturaModule,
    AventuraModule,
    DiagnosticoModule,
    ProgresoModule,
    GamificacionModule,
    AsistenteModule,
    AdministracionModule,
  ],
})
export class AppModule {}
