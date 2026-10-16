import { Controller, Get, Inject, NotFoundException, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import { Publico } from '../../../shared-kernel/public-api';
import { CASOS_USO_IAM, CasosUsoIam } from '../../application/casos-uso-iam';

/**
 * Adaptador primario: descarga de exportaciones (RF-012). El enlace firmado de 72 h es la
 * credencial, por eso es público; los archivos nunca se guardan en cachés intermedias.
 */
@Controller('exportaciones')
export class ExportacionesController {
  constructor(@Inject(CASOS_USO_IAM) private readonly iam: CasosUsoIam) {}

  @Publico()
  @Get(':id/:formato')
  async descargar(
    @Param('id') id: string,
    @Param('formato') formato: string,
    @Query('expira') expira: string,
    @Query('firma') firma: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const archivo = await this.iam.descargarExportacion.ejecutar({ id, formato, expira, firma });
    res.setHeader('Content-Type', archivo.tipoMime);
    res.setHeader('Content-Disposition', `attachment; filename="${archivo.nombreArchivo}"`);
    res.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(archivo.contenido);
  }
}

/** Bandeja de correos de desarrollo (solo sin SMTP y fuera de producción). */
@Controller('dev')
export class DesarrolloController {
  constructor(@Inject(CASOS_USO_IAM) private readonly iam: CasosUsoIam) {}

  @Publico()
  @Get('correos')
  correos() {
    if (!this.iam.bandejaDesarrollo || process.env['NODE_ENV'] === 'production') {
      throw new NotFoundException();
    }
    return this.iam.bandejaDesarrollo.correos();
  }
}
