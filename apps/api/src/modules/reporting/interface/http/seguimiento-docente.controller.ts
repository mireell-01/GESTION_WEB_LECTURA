import { Controller, Get, Inject, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import { Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_REPORTING, CasosUsoReporting } from '../../application/casos-uso-reporting';

/**
 * Adaptador primario: el seguimiento docente de un aula — `/api/v1/aulas/{id}/*` (SAD §7, RF-063 a
 * RF-067). Solo la docente del aula (RN-17); el aula de otra docente responde 404.
 */
@Controller('aulas')
@Roles('DOCENTE')
export class SeguimientoDocenteController {
  constructor(@Inject(CASOS_USO_REPORTING) private readonly reporting: CasosUsoReporting) {}

  /** RF-063, RF-065, RF-066: mapa de calor por habilidad, alertas, resumen semanal y refuerzos. */
  @Get(':id/panel')
  panel(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string) {
    return this.reporting.panel.panel(u.sub, aulaId);
  }

  /** RF-064: el detalle de un estudiante con sus últimas 20 sesiones. */
  @Get(':id/estudiantes/:estudianteId/detalle')
  detalle(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Param('estudianteId') estudianteId: string) {
    return this.reporting.detalle.detalle(u.sub, aulaId, estudianteId);
  }

  /** RF-067: el reporte de aula en PDF o CSV. No se guarda en el servidor ni en cachés. */
  @Get(':id/reporte')
  async reporte(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id') aulaId: string,
    @Query('formato') formato: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const archivo = await this.reporting.reporte.reporte(u.sub, aulaId, formato);
    res.set({ 'Cache-Control': 'no-store' });
    return new StreamableFile(Buffer.from(archivo.contenido), {
      type: archivo.tipo,
      disposition: `attachment; filename="${archivo.nombreArchivo}"`,
    });
  }
}
