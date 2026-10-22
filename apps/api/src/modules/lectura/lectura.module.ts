import { Module } from '@nestjs/common';

import { ContenidoModule } from '../contenido/public-api';
import { EscuelaModule } from '../escuela/public-api';
import { IamModule } from '../iam/public-api';
import { lecturaProviders } from './infrastructure/lectura.providers';
import { RespuestasAbiertasController, SesionesLecturaController, ValoracionesController } from './interface/http/sesiones-lectura.controller';

/**
 * Módulo Lectura interactiva — sesiones de lectura con actividades antes, durante y después, y
 * revisión docente de las respuestas abiertas (RF-038 a RF-051). Depende de IAM, Escuela y Contenido.
 */
@Module({
  imports: [IamModule, EscuelaModule, ContenidoModule],
  controllers: [SesionesLecturaController, RespuestasAbiertasController, ValoracionesController],
  providers: [...lecturaProviders],
})
export class LecturaModule {}
