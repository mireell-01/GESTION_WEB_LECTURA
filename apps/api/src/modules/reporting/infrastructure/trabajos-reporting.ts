import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { redactar } from '../../shared-kernel/public-api';
import { CASOS_USO_REPORTING, CasosUsoReporting } from '../application/casos-uso-reporting';

/** SRS §7: las vistas de reportes se refrescan cada 5 minutos. */
export const CADA_5_MINUTOS = 5 * 60_000;

/**
 * Worker de reportes, en el mismo proceso (sin dependencias nuevas): cada 5 minutos refresca las vistas
 * materializadas y envía los resúmenes semanales pendientes: a docentes desde el lunes a las 07:00 de
 * Lima (RF-065) y a familias desde el domingo a las 18:00 (RF-070). No corre en las pruebas automáticas
 * (NODE_ENV=test) ni con REPORTES_TRABAJOS=off.
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
      // Cada resumen por separado: si uno falla, el otro igual sale.
      const resultados = await Promise.allSettled([this.casos.resumen.enviarPendientes(), this.casos.resumenFamiliar.enviarPendientes()]);
      const [docentes, familias] = resultados.map((r) => (r.status === 'fulfilled' ? r.value : 0));
      if (docentes) this.logger.log(`Resúmenes semanales enviados a docentes: ${docentes}`);
      if (familias) this.logger.log(`Resúmenes semanales enviados a familias: ${familias}`);
      for (const r of resultados) {
        if (r.status === 'rejected') this.logger.error(redactar(`Falló un resumen semanal: ${(r.reason as Error).message}`));
      }
    } catch (error) {
      this.logger.error(redactar(`Falló el trabajo de reportes: ${(error as Error).message}`));
    } finally {
      this.enCurso = false;
    }
  }
}
