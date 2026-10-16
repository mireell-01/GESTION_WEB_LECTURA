import { Module } from '@nestjs/common';
import { AsistenteController } from './interface/http/asistente.controller';
import { asistenteProviders } from './infrastructure/asistente.providers';

/**
 * Declaración NestJS del módulo asistente.
 */
@Module({
  controllers: [AsistenteController],
  providers: [...asistenteProviders],
  exports: [],
})
export class AsistenteModule {}
