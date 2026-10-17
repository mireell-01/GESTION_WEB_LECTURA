import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import { Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_ESCUELA, CasosUsoEscuela } from '../../application/casos-uso-escuela';
import {
  CrearAsignacionRequestDto,
  CrearAulaRequestDto,
  MatricularCsvRequestDto,
  MatricularRequestDto,
  TarjetasRequestDto,
} from '../dto/escuela.request.dto';

/**
 * Adaptador primario: modo escuela del docente — `/api/v1/aulas/*` (SRS §7, RF-014 a RF-020).
 * Los niños entran desde la tablet del aula activada por su docente (IAM, CR-01).
 */
@Controller('aulas')
@Roles('DOCENTE')
export class EscuelaController {
  constructor(@Inject(CASOS_USO_ESCUELA) private readonly escuela: CasosUsoEscuela) {}

  /** RF-014 */
  @Post()
  crearAula(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: CrearAulaRequestDto) {
    return this.escuela.crearAula.ejecutar({ docenteId: u.sub, ...dto });
  }

  @Get()
  listarAulas(@UsuarioActual() u: UsuarioAutenticado) {
    return this.escuela.listarAulas.ejecutar(u.sub);
  }

  @Get(':id')
  detalleAula(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string) {
    return this.escuela.detalleAula.ejecutar({ docenteId: u.sub, aulaId });
  }

  /** RF-015: el PIN no se devuelve; aparece solo en la tarjeta impresa (RF-017). */
  @Post(':id/matriculas')
  matricular(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Body() dto: MatricularRequestDto) {
    return this.escuela.matricular.uno({ docenteId: u.sub, aulaId, ...dto });
  }

  /** RF-016: hasta 60 filas; responde los matriculados y las filas rechazadas con su motivo. */
  @Post(':id/matriculas/importacion')
  matricularCsv(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Body() dto: MatricularCsvRequestDto) {
    return this.escuela.matricular.desdeCsv({ docenteId: u.sub, aulaId, csv: dto.csv });
  }

  /**
   * RF-017: PDF A4 con 8 tarjetas por hoja. Es POST (el SRS dice GET) porque asigna PIN nuevos:
   * un GET podría dispararse solo (vista previa de enlaces, reintentos) e invalidar tarjetas ya
   * entregadas. El PDF no se guarda en el servidor ni en cachés.
   */
  @Post(':id/tarjetas-acceso.pdf')
  @HttpCode(200)
  async tarjetas(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id') aulaId: string,
    @Body() dto: TarjetasRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const hoja = await this.escuela.generarTarjetas.ejecutar({ docenteId: u.sub, aulaId, estudianteIds: dto.estudianteIds });
    res.set({
      'Cache-Control': 'no-store',
      'X-Tarjetas': String(hoja.cantidad),
    });
    return new StreamableFile(hoja.pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${hoja.nombreArchivo}"`,
    });
  }

  @Delete(':id/matriculas/:estudianteId')
  retirar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Param('estudianteId') estudianteId: string) {
    return this.escuela.retirarEstudiante.ejecutar({ docenteId: u.sub, aulaId, estudianteId });
  }

  /** RF-018: lecturas y misiones publicadas que se pueden asignar. */
  @Get(':id/asignaciones/catalogo')
  catalogo(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string) {
    return this.escuela.catalogoDelAula.ejecutar({ docenteId: u.sub, aulaId });
  }

  /** RF-018 */
  @Post(':id/asignaciones')
  crearAsignacion(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Body() dto: CrearAsignacionRequestDto) {
    return this.escuela.crearAsignacion.ejecutar({ docenteId: u.sub, aulaId, ...dto });
  }

  @Get(':id/asignaciones')
  listarAsignaciones(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string) {
    return this.escuela.listarAsignaciones.ejecutar({ docenteId: u.sub, aulaId });
  }

  @Post(':id/asignaciones/:asignacionId/cerrar')
  @HttpCode(200)
  cerrarAsignacion(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id') aulaId: string,
    @Param('asignacionId') asignacionId: string,
  ) {
    return this.escuela.cerrarAsignacion.ejecutar({ docenteId: u.sub, aulaId, asignacionId });
  }

  /** RF-020 */
  @Post(':id/archivar')
  @HttpCode(200)
  archivar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string) {
    return this.escuela.archivarAula.ejecutar({ docenteId: u.sub, aulaId });
  }
}
