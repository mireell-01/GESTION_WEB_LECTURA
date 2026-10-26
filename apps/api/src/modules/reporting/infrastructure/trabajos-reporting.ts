import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { redactar } from '../../shared-kernel/public-api';
import { CASOS_USO_REPORTING, CasosUsoReporting } from '../application/casos-uso-reporting';

/** SRS §7: las vistas de reportes se refrescan cada 5 minutos. */
export const CADA_5_MINUTOS = 5 * 60_000;

/**
 * Worker de reportes, en el mismo proceso (sin dependencias nuevas): cada 5 minutos refresca las vistas
 * materializadas y, desde el lunes a las 07:00 de Lima, envía los resúmenes semanales pendientes
 * (RF-065). No corre en las pruebas automáticas (NODE_ENV=test) ni con REPORTES_TRABAJOS=off.
 */
@Injectable()
export class TrabajosReporting implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Reportes');
  private intervalo: NodeJS.Timeout | undefined;
  private inicial: NodeJS.Timeout | undefined;
  private enCurso = false;

  constructor(@Inject(CASOS_USO_REPORTING) private readonly casos: CasosUsoReporting) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test' || process.env['REPORTES_TRABAJOS'] === 'off') return;
    this.inicial = setTimeout(() => void this.ejecutar(), 15_000);
    this.intervalo = setInterval(() => void this.ejecutar(), CADA_5_MINUTOS);
    this.inicial.unref();
    this.intervalo.unref();
  }

  onModuleDestroy(): void {
    clearTimeout(this.inicial);
    clearInterval(this.intervalo);
  }

  async ejecutar(): Promise<void> {
    if (this.enCurso) return;
    this.enCurso = true;
    try {
      await this.casos.vistas.refrescar();
      const enviados = await this.casos.resumen.enviarPendientes();
      if (enviados > 0) this.logger.log(`Resúmenes semanales enviados: ${enviados}`);
    } catch (error) {
      this.logger.error(redactar(`Falló el trabajo de reportes: ${(error as Error).message}`));
    } finally {
      this.enCurso = false;
    }
  }
}
