import { Module } from '@nestjs/common';
import { ContenidoController } from './interface/http/contenido.controller';
import { contenidoProviders } from './infrastructure/contenido.providers';

/**
 * Declaración NestJS del módulo contenido.
 */
@Module({
  controllers: [ContenidoController],
  providers: [...contenidoProviders],
  exports: [],
})
export class ContenidoModule {}
