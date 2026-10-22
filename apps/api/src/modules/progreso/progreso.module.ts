import { Module } from '@nestjs/common';

import { EscuelaModule } from '../escuela/public-api';
import { IamModule } from '../iam/public-api';
import { progresoProviders } from './infrastructure/progreso.providers';
import { PerfilLectorController } from './interface/http/perfil-lector.controller';

/**
 * Módulo Progreso — perfil lector, maestría por habilidad y recomendaciones (RF-052 a RF-055).
 * Depende de IAM y Escuela; escucha a Diagnóstico y Lectura por eventos (SAD §6).
 */
@Module({
  imports: [IamModule, EscuelaModule],
  controllers: [PerfilLectorController],
  providers: [...progresoProviders],
})
export class ProgresoModule {}
