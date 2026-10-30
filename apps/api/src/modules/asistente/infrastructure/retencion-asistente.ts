import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { redactar } from '../../shared-kernel/public-api';
import { CASOS_USO_ASISTENTE, CasosUsoAsistente } from '../application/casos-uso-asistente';

/** Cada 6 horas basta: lo que importa es que nada quede más de 30 días (más unas horas). */
export const CADA_6_HORAS = 6 * 60 * 60_000;

/**
 * SRS §7 y ADR-008: las conversaciones del asistente se guardan 30 días para auditoría y luego se
 * borran con sus turnos. Corre dentro de la API (sin dependencias nuevas); no en las pruebas
 * automáticas (NODE_ENV=test) ni con ASISTENTE_TRABAJOS=off.
 */
@Injectable()
export class RetencionAsistente implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Asistente');
  private intervalo: NodeJS.Timeout | undefined;
  private inicial: NodeJS.Timeout | undefined;

  constructor(@Inject(CASOS_USO_ASISTENTE) private readonly casos: CasosUsoAsistente) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test' || process.env['ASISTENTE_TRABAJOS'] === 'off') return;
    this.inicial = setTimeout(() => void this.ejecutar(), 30_000);
    this.intervalo = setInterval(() => void this.ejecutar(), CADA_6_HORAS);
    this.inicial.unref();
    this.intervalo.unref();
  }

  onModuleDestroy(): void {
    clearTimeout(this.inicial);
    clearInterval(this.intervalo);
  }

  async ejecutar(): Promise<void> {
    try {
      const borradas = await this.casos.retencion.borrarVencidas(new Date());
      if (borradas > 0) this.logger.log(`Conversaciones del asistente borradas por antigüedad: ${borradas}`);
    } catch (error) {
      this.logger.error(redactar(`Falló la limpieza de conversaciones: ${(error as Error).message}`));
    }
  }
}
