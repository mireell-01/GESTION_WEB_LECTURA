import { Module } from '@nestjs/common';

import { EscuelaModule } from '../escuela/public-api';
import { IamModule } from '../iam/public-api';
import { diagnosticoProviders } from './infrastructure/diagnostico.providers';
import { DiagnosticosController, ReevaluacionesController } from './interface/http/diagnosticos.controller';

/** Módulo Diagnóstico — reto inicial, nivel por habilidad y reevaluación (RF-034 a RF-037). Depende de IAM y Escuela. */
@Module({
  imports: [IamModule, EscuelaModule],
  controllers: [DiagnosticosController, ReevaluacionesController],
  providers: [...diagnosticoProviders],
})
export class DiagnosticoModule {}
