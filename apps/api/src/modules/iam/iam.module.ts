import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { LimiteTasaGuard } from '../shared-kernel/public-api';

import { IamFacade } from './application/iam.facade';
import { iamProviders } from './infrastructure/iam.providers';
import { AutenticacionGuard, RolesGuard } from './interface/http/guards';
import { IamController } from './interface/http/iam.controller';

/**
 * Módulo IAM — identidad, consentimiento y acceso (RF-001 a RF-013).
 * Registra los guards globales: límite de tasa (RNF-019), sesión obligatoria salvo @Publico() y roles.
 */
@Module({
  controllers: [IamController],
  providers: [
    ...iamProviders,
    { provide: APP_GUARD, useClass: LimiteTasaGuard },
    { provide: APP_GUARD, useClass: AutenticacionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [IamFacade],
})
export class IamModule {}
