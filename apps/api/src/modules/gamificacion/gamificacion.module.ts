import { Module } from '@nestjs/common';
import { GamificacionController } from './interface/http/gamificacion.controller';
import { gamificacionProviders } from './infrastructure/gamificacion.providers';

/**
 * Declaración NestJS del módulo gamificacion.
 */
@Module({
  controllers: [GamificacionController],
  providers: [...gamificacionProviders],
  exports: [],
})
export class GamificacionModule {}
