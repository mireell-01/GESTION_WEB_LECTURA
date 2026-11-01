import { Module } from '@nestjs/common';

import { EscuelaModule } from '../escuela/public-api';
import { GamificacionModule } from '../gamificacion/public-api';
import { IamModule } from '../iam/public-api';
import { administracionProviders } from './infrastructure/administracion.providers';
import { AdministracionController } from './interface/http/administracion.controller';

/**
 * Módulo Administración de la plataforma (RF-076 a RF-078): instituciones y cuentas docentes,
 * auditoría de acciones sensibles y parámetros de gamificación. Usa IAM, Escuela y Gamificación
 * por su public-api y escucha los eventos de todos los módulos para auditar.
 */
@Module({
  imports: [IamModule, EscuelaModule, GamificacionModule],
  controllers: [AdministracionController],
  providers: [...administracionProviders],
})
export class AdministracionModule {}
