import { Module } from '@nestjs/common';
import { LecturaController } from './interface/http/lectura.controller';
import { lecturaProviders } from './infrastructure/lectura.providers';

/**
 * Declaración NestJS del módulo lectura.
 */
@Module({
  controllers: [LecturaController],
  providers: [...lecturaProviders],
  exports: [],
})
export class LecturaModule {}
