import { Module } from '@nestjs/common';

import { EscuelaModule } from '../escuela/public-api';
import { IamModule } from '../iam/public-api';
import { asistenteProviders } from './infrastructure/asistente.providers';
import { ActivacionAsistenteController, AsistenteLecturaController, BorradorRetroalimentacionController } from './interface/http/asistente.controller';

/**
 * Módulo Asistente — el asistente de lectura (Módulo 11, RF-072 a RF-075, ADR-008): orienta al niño con
 * preguntas socráticas sin dar la respuesta, filtra todo lo que dice, se activa por estudiante y
 * propone borradores de retroalimentación a la docente. Usa Lectura por el shared-kernel e IAM y
 * Escuela por su fachada.
 */
@Module({
  imports: [IamModule, EscuelaModule],
  controllers: [AsistenteLecturaController, ActivacionAsistenteController, BorradorRetroalimentacionController],
  providers: [...asistenteProviders],
})
export class AsistenteModule {}
