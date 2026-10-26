import { Module } from '@nestjs/common';

import { EscuelaModule } from '../escuela/public-api';
import { IamModule } from '../iam/public-api';
import { reportingProviders } from './infrastructure/reporting.providers';
import { SeguimientoDocenteController } from './interface/http/seguimiento-docente.controller';

/**
 * Módulo Reporting — paneles de seguimiento (SAD: "Reporting · Paneles"). Módulo 9: seguimiento
 * docente (RF-063 a RF-067). Lee las vistas del schema `reporting` y usa Escuela e IAM por su fachada y
 * el historial de Lectura por el shared-kernel.
 */
@Module({
  imports: [IamModule, EscuelaModule],
  controllers: [SeguimientoDocenteController],
  providers: [...reportingProviders],
})
export class ReportingModule {}
