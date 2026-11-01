import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { redactar } from '../../shared-kernel/public-api';
import { CASOS_USO_ADMINISTRACION, CasosUsoAdministracion } from '../application/casos-uso-administracion';

/** Una vez al día basta: la retención se cuenta en años. */
export const CADA_DIA = 24 * 60 * 60_000;

/**
 * RF-077: la auditoría se conserva 2 años; este trabajo borra lo más antiguo (la base solo permite
 * borrar eso). Corre dentro de la API; no en las pruebas automáticas (NODE_ENV=test) ni con
 * ADMINISTRACION_TRABAJOS=off.
 */
@Injectable()
export class RetencionAuditoria implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Auditoria');
  private intervalo: NodeJS.Timeout | undefined;
  private inicial: NodeJS.Timeout | undefined;

  constructor(@Inject(CASOS_USO_ADMINISTRACION) private readonly casos: CasosUsoAdministracion) {}

  onModuleInit(): void {
    if (process.env['NODE_ENV'] === 'test' || process.env['ADMINISTRACION_TRABAJOS'] === 'off') return;
    this.inicial = setTimeout(() => void this.ejecutar(), 60_000);
    this.intervalo = setInterval(() => void this.ejecutar(), CADA_DIA);
    this.inicial.unref();
    this.intervalo.unref();
  }

  onModuleDestroy(): void {
    clearTimeout(this.inicial);
    clearInterval(this.intervalo);
  }

  async ejecutar(): Promise<void> {
    try {
      const borrados = await this.casos.auditoria.depurar(new Date());
      if (borrados > 0) this.logger.log(`Registros de auditoría borrados por antigüedad (más de 2 años): ${borrados}`);
    } catch (error) {
      this.logger.error(redactar(`Falló la limpieza de la auditoría: ${(error as Error).message}`));
    }
  }
}
