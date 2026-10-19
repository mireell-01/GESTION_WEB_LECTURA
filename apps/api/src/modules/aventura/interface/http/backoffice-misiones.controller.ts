import { Body, Controller, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';

import { RangoEdad, Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_AVENTURA, CasosUsoAventura } from '../../application/casos-uso-aventura';
import { CrearMisionRequestDto, DatosMisionRequestDto, EdadQueryDto, ReordenarMisionesRequestDto } from '../dto/aventura.request.dto';

/**
 * Adaptador primario: backoffice de misiones — `/api/v1/backoffice/mundos/*` y `/misiones/*`
 * (RF-032). El editor arma y ordena las misiones; el revisor las consulta. Siempre con MFA (RF-011).
 */
@Controller('backoffice')
export class BackofficeMisionesController {
  constructor(@Inject(CASOS_USO_AVENTURA) private readonly aventura: CasosUsoAventura) {}

  @Roles('EDITOR', 'REVISOR')
  @Get('mundos')
  mundos() {
    return this.aventura.misiones.mundos();
  }

  @Roles('EDITOR', 'REVISOR')
  @Get('mundos/:id/misiones')
  misiones(@Param('id') mundoId: string, @Query() q: EdadQueryDto) {
    return this.aventura.misiones.misiones(mundoId, q.edad as RangoEdad);
  }

  /** Lecturas publicadas de esa edad que se pueden poner en una misión. */
  @Roles('EDITOR')
  @Get('misiones/lecturas-disponibles')
  lecturasDisponibles(@Query() q: EdadQueryDto) {
    return this.aventura.misiones.lecturasDisponibles(q.edad as RangoEdad);
  }

  @Roles('EDITOR')
  @Post('mundos/:id/misiones')
  crear(@UsuarioActual() u: UsuarioAutenticado, @Param('id') mundoId: string, @Body() dto: CrearMisionRequestDto) {
    return this.aventura.misiones.crear({
      editorId: u.sub,
      mundoId,
      rangoEdad: dto.rangoEdad as RangoEdad,
      titulo: dto.titulo,
      descripcion: dto.descripcion ?? '',
      lecturaIds: dto.lecturaIds,
    });
  }

  @Roles('EDITOR')
  @Put('misiones/:id')
  actualizar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') misionId: string, @Body() dto: DatosMisionRequestDto) {
    return this.aventura.misiones.actualizar({ editorId: u.sub, misionId, titulo: dto.titulo, descripcion: dto.descripcion ?? '', lecturaIds: dto.lecturaIds });
  }

  @Roles('EDITOR')
  @Put('mundos/:id/orden')
  reordenar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') mundoId: string, @Body() dto: ReordenarMisionesRequestDto) {
    return this.aventura.misiones.reordenar({ editorId: u.sub, mundoId, rangoEdad: dto.rangoEdad as RangoEdad, misionIds: dto.misionIds });
  }
}
