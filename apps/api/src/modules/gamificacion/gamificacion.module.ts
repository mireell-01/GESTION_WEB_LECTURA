import { Module } from '@nestjs/common';

import { IamModule } from '../iam/public-api';
import { gamificacionProviders } from './infrastructure/gamificacion.providers';
import { PasaporteController } from './interface/http/pasaporte.controller';

/**
 * Módulo Gamificación — puntos, nivel lector, insignias, Pasaporte del Lector, reto del día, racha y
 * recompensas (RF-056 a RF-062). Depende de IAM; escucha a Lectura, Progreso y Aventura por eventos (SAD §6).
 */
@Module({
  imports: [IamModule],
  controllers: [PasaporteController],
  providers: [...gamificacionProviders],
})
export class GamificacionModule {}
