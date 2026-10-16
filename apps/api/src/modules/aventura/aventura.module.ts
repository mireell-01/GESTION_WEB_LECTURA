import { Module } from '@nestjs/common';
import { AventuraController } from './interface/http/aventura.controller';
import { aventuraProviders } from './infrastructure/aventura.providers';

/**
 * Declaración NestJS del módulo aventura.
 */
@Module({
  controllers: [AventuraController],
  providers: [...aventuraProviders],
  exports: [],
})
export class AventuraModule {}
