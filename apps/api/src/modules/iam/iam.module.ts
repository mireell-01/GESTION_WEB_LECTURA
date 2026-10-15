import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { LimiteTasaGuard } from '../shared-kernel/public-api';

import { IamFacade } from './application/iam.facade';
import { iamProviders } from './infrastructure/iam.providers';
import { AutenticacionGuard, RolesGuard } from './interface/http/guards';
import { AccesoEstudianteController } from './interface/http/acceso-estudiante.controller';
import { AuthController } from './interface/http/auth.controller';
import { EstudiantesController } from './interface/http/estudiantes.controller';
import { DesarrolloController, ExportacionesController } from './interface/http/exportaciones.controller';

/**
 * Módulo IAM — identidad, consentimiento y acceso (RF-001 a RF-013).
 * Registra los guards globales: límite de tasa (RNF-019), sesión obligatoria salvo @Publico() y roles.
 */
@Module({
  controllers: [AuthController, EstudiantesController, AccesoEstudianteController, ExportacionesController, DesarrolloController],
  providers: [
    ...iamProviders,
    { provide: APP_GUARD, useClass: LimiteTasaGuard },
    { provide: APP_GUARD, useClass: AutenticacionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [IamFacade],
})
export class IamModule {}
