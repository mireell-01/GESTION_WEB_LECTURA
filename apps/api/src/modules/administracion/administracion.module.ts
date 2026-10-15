import { Module } from '@nestjs/common';
import { AdministracionController } from './interface/http/administracion.controller';
import { administracionProviders } from './infrastructure/administracion.providers';

/**
 * Declaración NestJS del módulo administracion.
 */
@Module({
  controllers: [AdministracionController],
  providers: [...administracionProviders],
  exports: [],
})
export class AdministracionModule {}
