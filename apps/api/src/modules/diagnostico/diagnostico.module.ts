import { Module } from '@nestjs/common';
import { DiagnosticoController } from './interface/http/diagnostico.controller';
import { diagnosticoProviders } from './infrastructure/diagnostico.providers';

/**
 * Declaración NestJS del módulo diagnostico.
 */
@Module({
  controllers: [DiagnosticoController],
  providers: [...diagnosticoProviders],
  exports: [],
})
export class DiagnosticoModule {}
