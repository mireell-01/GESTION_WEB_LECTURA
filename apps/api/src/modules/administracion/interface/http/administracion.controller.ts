import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';

import { Auditar, Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_ADMINISTRACION, CasosUsoAdministracion } from '../../application/casos-uso-administracion';
import {
  AltaDocenteRequestDto,
  ConsultaAuditoriaRequestDto,
  CrearInstitucionRequestDto,
  EstadoInstitucionRequestDto,
  FiltroDocentesRequestDto,
  ParametrosGamificacionRequestDto,
} from '../dto/administracion.request.dto';

/**
 * Adaptador primario: administración de la plataforma — `/api/v1/admin/*` (SAD §7, RF-076 a RF-078).
 * Solo ADMIN_PLATAFORMA con verificación en dos pasos (RF-011, como todo el backoffice).
 */
@Controller('admin')
@Roles('ADMIN_PLATAFORMA')
export class AdministracionController {
  constructor(@Inject(CASOS_USO_ADMINISTRACION) private readonly casos: CasosUsoAdministracion) {}

  // ── RF-076: instituciones ────────────────────────────────────────────────
  @Get('instituciones')
  instituciones() {
    return this.casos.instituciones.listar();
  }

  @Post('instituciones')
  crearInstitucion(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: CrearInstitucionRequestDto) {
    return this.casos.instituciones.crear(dto, u.sub);
  }

  @Patch('instituciones/:id')
  estadoInstitucion(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string, @Body() dto: EstadoInstitucionRequestDto) {
    return this.casos.instituciones.cambiarEstado(id, dto.estado, u.sub);
  }

  // ── RF-076: docentes ─────────────────────────────────────────────────────
  @Get('docentes')
  docentes(@Query() filtro: FiltroDocentesRequestDto) {
    return this.casos.docentes.listar(filtro);
  }

  @Post('docentes')
  altaDocente(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: AltaDocenteRequestDto) {
    return this.casos.docentes.darDeAlta(dto, u.sub);
  }

  /** Pierde el acceso al instante; sus aulas quedan en solo lectura y sus estudiantes siguen leyendo. */
  @Post('docentes/:id/suspension')
  @HttpCode(200)
  suspender(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string) {
    return this.casos.docentes.suspender(id, u.sub);
  }

  @Delete('docentes/:id/suspension')
  reactivar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string) {
    return this.casos.docentes.reactivar(id, u.sub);
  }

  // ── RF-077: auditoría ────────────────────────────────────────────────────
  @Get('auditoria')
  @Auditar({ accion: 'AUDITORIA_CONSULTADA', recurso: 'auditoria' })
  auditoria(@Query() consulta: ConsultaAuditoriaRequestDto) {
    return this.casos.auditoria.consultar(consulta);
  }

  @Get('auditoria/acciones')
  accionesAuditadas() {
    return this.casos.auditoria.acciones();
  }

  // ── RF-078: parámetros de gamificación ──────────────────────────────────
  @Get('parametros-gamificacion')
  parametros() {
    return this.casos.parametros.vigentes();
  }

  @Get('parametros-gamificacion/historial')
  historialParametros() {
    return this.casos.parametros.historial();
  }

  /** Publica una versión nueva: aplica solo a lo que ocurra desde ahora. */
  @Put('parametros-gamificacion')
  publicarParametros(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: ParametrosGamificacionRequestDto) {
    return this.casos.parametros.publicar(dto, u.sub);
  }
}
