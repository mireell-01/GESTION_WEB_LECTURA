import { Body, Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';

import { Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_DIAGNOSTICO, CasosUsoDiagnostico } from '../../application/casos-uso-diagnostico';
import { AsignarReevaluacionRequestDto, ResponderRequestDto } from '../dto/diagnostico.request.dto';

/**
 * Adaptador primario: reto del estudiante — `/api/v1/diagnosticos/*` (SRS §7, RF-034 a RF-036).
 * Solo el propio estudiante, con la sesión de su avatar y PIN.
 */
@Controller('diagnosticos')
@Roles('ESTUDIANTE')
export class DiagnosticosController {
  constructor(@Inject(CASOS_USO_DIAGNOSTICO) private readonly diagnostico: CasosUsoDiagnostico) {}

  /** Qué reto tiene pendiente (sin crear nada). */
  @Get('actual')
  actual(@UsuarioActual() u: UsuarioAutenticado) {
    return this.diagnostico.reto.actual(u.sub);
  }

  /** RF-034, RF-036: empieza el reto inicial o reanuda el pendiente. */
  @Post()
  comenzar(@UsuarioActual() u: UsuarioAutenticado) {
    return this.diagnostico.reto.comenzar(u.sub);
  }

  /** RF-036: la pregunta siguiente a la última respondida (`item: null` si ya respondió todas). */
  @Get(':id/siguiente-item')
  async siguiente(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string) {
    return { item: await this.diagnostico.reto.siguiente(u.sub, id) };
  }

  @Post(':id/respuestas')
  @HttpCode(200)
  responder(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string, @Body() dto: ResponderRequestDto) {
    return this.diagnostico.reto.responder(u.sub, id, dto.itemId, dto.indice);
  }

  @Post(':id/pausar')
  @HttpCode(200)
  pausar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string) {
    return this.diagnostico.reto.pausar(u.sub, id);
  }

  /** RF-035, RF-033: calcula el nivel inicial por habilidad; Aventura ubica al niño en su mundo. */
  @Post(':id/finalizar')
  @HttpCode(200)
  finalizar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string) {
    return this.diagnostico.reto.finalizar(u.sub, id);
  }

  @Get(':id/resultado')
  resultado(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string) {
    return this.diagnostico.reto.resultado(u.sub, id);
  }
}

/** Adaptador primario: reevaluación periódica del aula — `/api/v1/aulas/{id}/reevaluaciones` (RF-037). */
@Controller('aulas')
@Roles('DOCENTE')
export class ReevaluacionesController {
  constructor(@Inject(CASOS_USO_DIAGNOSTICO) private readonly diagnostico: CasosUsoDiagnostico) {}

  @Post(':id/reevaluaciones')
  asignar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Body() dto: AsignarReevaluacionRequestDto) {
    return this.diagnostico.reevaluaciones.asignar({ docenteId: u.sub, aulaId, estudianteIds: dto.estudianteIds });
  }

  @Get(':id/reevaluaciones')
  resumen(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string) {
    return this.diagnostico.reevaluaciones.resumen(u.sub, aulaId);
  }
}
