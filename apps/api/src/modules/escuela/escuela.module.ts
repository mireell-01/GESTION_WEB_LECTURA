import { Module } from '@nestjs/common';

import { IamModule } from '../iam/public-api';
import { EscuelaFacade } from './application/escuela.facade';
import { escuelaProviders } from './infrastructure/escuela.providers';
import { EscuelaController, InstitucionesDocenteController } from './interface/http/escuela.controller';
import { FamiliaYEstudianteController } from './interface/http/familia-y-estudiante.controller';

/** Módulo Escuela — aulas, matrículas y asignaciones (RF-014 a RF-020). Depende de IAM. */
@Module({
  imports: [IamModule],
  controllers: [EscuelaController, FamiliaYEstudianteController, InstitucionesDocenteController],
  providers: [...escuelaProviders],
  exports: [EscuelaFacade],
})
export class EscuelaModule {}
