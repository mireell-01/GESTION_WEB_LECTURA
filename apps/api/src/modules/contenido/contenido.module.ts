import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { raw } from 'express';

import { IamModule } from '../iam/public-api';
import { ContenidoFacade } from './application/contenido.facade';
import { contenidoProviders } from './infrastructure/contenido.providers';
import { MAX_BYTES_AUDIO } from './application/dto/contrato-contenido';
import { BackofficeLecturasController } from './interface/http/backoffice-lecturas.controller';
import { BibliotecaController } from './interface/http/biblioteca.controller';

/** Módulo Contenido — biblioteca, autoría, revisión y versiones de lecturas (RF-021 a RF-029). Depende de IAM. */
@Module({
  imports: [IamModule],
  controllers: [BackofficeLecturasController, BibliotecaController],
  providers: [...contenidoProviders],
  exports: [ContenidoFacade],
})
export class ContenidoModule implements NestModule {
  /** RF-023: el archivo llega en binario a su URL firmada (como un PUT a S3), no como JSON. */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(raw({ type: () => true, limit: MAX_BYTES_AUDIO + 1024 }))
      .forRoutes({ path: 'backoffice/recursos/:id/archivo', method: RequestMethod.PUT });
  }
}
