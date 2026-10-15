import { Module } from '@nestjs/common';

import { IamModule } from '../iam/public-api';
import { EscuelaFacade } from './application/escuela.facade';
import { escuelaProviders } from './infrastructure/escuela.providers';
import { EscuelaController } from './interface/http/escuela.controller';

/** Módulo Escuela — aulas, matrículas y asignaciones (RF-014 a RF-020). Depende de IAM. */
@Module({
  imports: [IamModule],
  controllers: [EscuelaController],
  providers: [...escuelaProviders],
  exports: [EscuelaFacade],
})
export class EscuelaModule {}
