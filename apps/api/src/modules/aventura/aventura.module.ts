import { Module } from '@nestjs/common';

import { IamModule } from '../iam/public-api';
import { aventuraProviders } from './infrastructure/aventura.providers';
import { AventuraController } from './interface/http/aventura.controller';
import { BackofficeMisionesController } from './interface/http/backoffice-misiones.controller';

/** Módulo Aventura — mapa de 5 mundos, misiones y desbloqueo (RF-030 a RF-033). Depende de IAM. */
@Module({
  imports: [IamModule],
  controllers: [AventuraController, BackofficeMisionesController],
  providers: [...aventuraProviders],
})
export class AventuraModule {}
