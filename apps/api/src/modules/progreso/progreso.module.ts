import { Module } from '@nestjs/common';
import { ProgresoController } from './interface/http/progreso.controller';
import { progresoProviders } from './infrastructure/progreso.providers';

/**
 * Declaración NestJS del módulo progreso.
 */
@Module({
  controllers: [ProgresoController],
  providers: [...progresoProviders],
  exports: [],
})
export class ProgresoModule {}
