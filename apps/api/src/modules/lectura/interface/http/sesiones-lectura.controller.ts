import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, Query } from '@nestjs/common';

import { Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_LECTURA, CasosUsoLectura } from '../../application/casos-uso-lectura';
import {
  DecisionRequestDto,
  FinalizarRequestDto,
  IniciarSesionRequestDto,
  PrediccionRequestDto,
  RespuestaRequestDto,
  RespuestasAbiertasQueryDto,
  ValoracionRequestDto,
} from '../dto/lectura.request.dto';

/**
 * Adaptador primario: sesiones de lectura del estudiante — `/api/v1/sesiones-lectura/*` (SAD §7,
 * RF-038 a RF-049). Solo el propio estudiante; la clave de cada pregunta nunca sale del servidor.
 */
@Controller('sesiones-lectura')
@Roles('ESTUDIANTE')
export class SesionesLecturaController {
  constructor(@Inject(CASOS_USO_LECTURA) private readonly lectura: CasosUsoLectura) {}

  /** RF-038, RF-046: abre la lectura o reanuda la que dejó a medias. */
  @Post()
  iniciar(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: IniciarSesionRequestDto) {
    return this.lectura.sesiones.iniciar(u.sub, dto);
  }

  /** RF-039, RF-046: dónde va, con el texto que ya puede leer y la pregunta en pantalla. */
  @Get(':id')
  ver(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string) {
    return this.lectura.sesiones.ver(u.sub, id);
  }

  @Put(':id/prediccion')
  predecir(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string, @Body() dto: PrediccionRequestDto) {
    return this.lectura.sesiones.predecir(u.sub, id, dto);
  }

  /** RF-040: corrección en el servidor (p95 < 300 ms); si no acierta, la pista que sigue (RF-045). */
  @Post(':id/respuestas')
  @HttpCode(200)
  responder(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string, @Body() dto: RespuestaRequestDto) {
    return this.lectura.sesiones.responder(u.sub, id, dto);
  }

  @Post(':id/items/:itemId/pistas')
  @HttpCode(200)
  pedirPista(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string, @Param('itemId') itemId: string) {
    return this.lectura.sesiones.pedirPista(u.sub, id, itemId);
  }

  @Post(':id/decisiones')
  @HttpCode(200)
  decidir(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string, @Body() dto: DecisionRequestDto) {
    return this.lectura.sesiones.decidir(u.sub, id, dto);
  }

  @Post(':id/finalizar')
  @HttpCode(200)
  finalizar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string, @Body() dto: FinalizarRequestDto) {
    return this.lectura.sesiones.finalizar(u.sub, id, dto.reflexion);
  }
}

/** Adaptador primario: respuestas abiertas de un aula para su docente (RF-051, RN-17). */
@Controller('aulas')
@Roles('DOCENTE')
export class RespuestasAbiertasController {
  constructor(@Inject(CASOS_USO_LECTURA) private readonly lectura: CasosUsoLectura) {}

  @Get(':id/respuestas-abiertas')
  listar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Query() q: RespuestasAbiertasQueryDto) {
    return this.lectura.revision.respuestas(u.sub, aulaId, q.estado);
  }
}

/** Adaptador primario: valoración docente con la rúbrica de 3 niveles (RF-051). */
@Controller('respuestas')
@Roles('DOCENTE')
export class ValoracionesController {
  constructor(@Inject(CASOS_USO_LECTURA) private readonly lectura: CasosUsoLectura) {}

  @Post(':id/valoracion')
  @HttpCode(200)
  valorar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') respuestaId: string, @Body() dto: ValoracionRequestDto) {
    return this.lectura.revision.valorar(u.sub, respuestaId, dto);
  }
}
