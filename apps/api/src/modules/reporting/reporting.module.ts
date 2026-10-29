import { Module } from '@nestjs/common';

import { EscuelaModule } from '../escuela/public-api';
import { IamModule } from '../iam/public-api';
import { reportingProviders } from './infrastructure/reporting.providers';
import { AcompanamientoFamiliarController } from './interface/http/acompanamiento-familiar.controller';
import { DesarrolloReportesController } from './interface/http/desarrollo-reportes.controller';
import { SeguimientoDocenteController } from './interface/http/seguimiento-docente.controller';

/**
 * Módulo Reporting — paneles de seguimiento (SAD: "Reporting · Paneles"). Módulo 9: seguimiento
 * docente (RF-063 a RF-067). Módulo 10: acompañamiento familiar (RF-068 a RF-070). Lee las vistas del
 * schema `reporting` y usa Escuela e IAM por su fachada, y Lectura y Contenido por el shared-kernel.
 */
@Module({
  imports: [IamModule, EscuelaModule],
  controllers: [SeguimientoDocenteController, AcompanamientoFamiliarController, DesarrolloReportesController],
  providers: [...reportingProviders],
})
export class ReportingModule {}
