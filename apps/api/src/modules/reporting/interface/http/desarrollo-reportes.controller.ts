import { Body, Controller, HttpCode, Inject, NotFoundException, Post } from '@nestjs/common';

import { Publico } from '../../../shared-kernel/public-api';
import { CASOS_USO_REPORTING, CasosUsoReporting } from '../../application/casos-uso-reporting';
import { EjecutarTrabajosRequestDto } from '../dto/familia.request.dto';

/**
 * Solo desarrollo (como la bandeja de correos): corre los trabajos de reportes —refresco de vistas y
 * resúmenes semanales de docentes y familias— como si fuera `ahora`, para probar el envío del domingo
 * (RF-070) y del lunes (RF-065) sin esperarlos. No existe en producción ni con un SMTP real.
 */
@Controller('dev')
export class DesarrolloReportesController {
  constructor(@Inject(CASOS_USO_REPORTING) private readonly reporting: CasosUsoReporting) {}

  @Publico()
  @Post('reportes/ejecutar')
  @HttpCode(200)
  async ejecutar(@Body() dto: EjecutarTrabajosRequestDto) {
    if (process.env['NODE_ENV'] === 'production' || process.env['SMTP_HOST']) throw new NotFoundException();
    const ahora = dto.ahora ? new Date(dto.ahora) : new Date();
    await this.reporting.vistas.refrescar();
    return {
      docentes: await this.reporting.resumen.enviarPendientes(ahora),
      familias: await this.reporting.resumenFamiliar.enviarPendientes(ahora),
    };
  }
}
