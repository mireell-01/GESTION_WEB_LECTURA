import { Body, Controller, Get, Inject, Param, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';

import { LimiteTasa, Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_ASISTENTE, CasosUsoAsistente } from '../../application/casos-uso-asistente';
import { RespuestaAsistente } from '../../application/dto/asistente.dto';
import { ActivacionAulaRequestDto, ActivacionRequestDto, TurnoRequestDto } from '../dto/asistente.request.dto';

/** Palabras por fragmento del flujo SSE: el niño ve aparecer la respuesta de inmediato (RNF-007). */
const PALABRAS_POR_FRAGMENTO = 4;

/** Escribe la respuesta como eventos SSE: fragmentos de texto y un cierre con lo que queda. */
function enviarComoEventos(res: Response, r: RespuestaAsistente): void {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  const palabras = r.texto.split(' ');
  for (let i = 0; i < palabras.length; i += PALABRAS_POR_FRAGMENTO) {
    const texto = palabras.slice(i, i + PALABRAS_POR_FRAGMENTO).join(' ') + (i + PALABRAS_POR_FRAGMENTO < palabras.length ? ' ' : '');
    res.write(`data: ${JSON.stringify({ tipo: 'texto', texto })}\n\n`);
  }
  res.write(`data: ${JSON.stringify({ tipo: 'fin', restantes: r.restantes, filtrado: r.filtrado, cerrada: r.cerrada })}\n\n`);
  res.end();
}

/**
 * Adaptador primario: el asistente durante la lectura — `/api/v1/sesiones-lectura/{id}/asistente*`
 * (SAD §7, RF-072 a RF-074). Solo el propio estudiante y si un adulto lo activó.
 */
@Controller('sesiones-lectura')
@Roles('ESTUDIANTE')
export class AsistenteLecturaController {
  constructor(@Inject(CASOS_USO_ASISTENTE) private readonly asistente: CasosUsoAsistente) {}

  /** Si está disponible, cuántos intercambios quedan y lo conversado en esta lectura. */
  @Get(':id/asistente')
  estado(@UsuarioActual() u: UsuarioAutenticado, @Param('id') sesionId: string) {
    return this.asistente.conversar.estado(u.sub, sesionId);
  }

  /** Un intercambio, respondido por SSE. Los errores (404, 403, 400) llegan antes de abrir el flujo. */
  @Post(':id/asistente/turnos')
  // Un aula entera (hasta 45 niños) suele salir por la misma IP del colegio; cada niño ya tiene su
  // propio tope de 10 intercambios por lectura (RF-074).
  @LimiteTasa({ nombre: 'asistente-turnos', maximoPorMinuto: 300, por: 'ip' })
  async turno(@UsuarioActual() u: UsuarioAutenticado, @Param('id') sesionId: string, @Body() dto: TurnoRequestDto, @Res() res: Response): Promise<void> {
    enviarComoEventos(res, await this.asistente.conversar.conversar(u.sub, sesionId, dto));
  }
}

/** RF-072: la familia o la docente activan el asistente (RN-17: solo de sus niños). */
@Controller()
export class ActivacionAsistenteController {
  constructor(@Inject(CASOS_USO_ASISTENTE) private readonly asistente: CasosUsoAsistente) {}

  @Roles('FAMILIAR')
  @Get('familia/estudiantes/:id/asistente')
  deHijo(@UsuarioActual() u: UsuarioAutenticado, @Param('id') estudianteId: string) {
    return this.asistente.activacion.deFamilia(u.sub, estudianteId);
  }

  @Roles('FAMILIAR')
  @Put('familia/estudiantes/:id/asistente')
  cambiarHijo(@UsuarioActual() u: UsuarioAutenticado, @Param('id') estudianteId: string, @Body() dto: ActivacionRequestDto) {
    return this.asistente.activacion.cambiarFamilia(u.sub, estudianteId, dto.activo);
  }

  @Roles('DOCENTE')
  @Get('aulas/:id/asistente')
  deAula(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string) {
    return this.asistente.activacion.deAula(u.sub, aulaId);
  }

  @Roles('DOCENTE')
  @Put('aulas/:id/asistente')
  cambiarAula(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Body() dto: ActivacionAulaRequestDto) {
    return this.asistente.activacion.cambiarAula(u.sub, aulaId, dto.estudianteIds, dto.activo);
  }
}

/** RF-075: el borrador de retroalimentación de una respuesta abierta, solo para la docente. */
@Controller('respuestas')
@Roles('DOCENTE')
export class BorradorRetroalimentacionController {
  constructor(@Inject(CASOS_USO_ASISTENTE) private readonly asistente: CasosUsoAsistente) {}

  @Get(':id/borrador-retroalimentacion')
  async borrador(@UsuarioActual() u: UsuarioAutenticado, @Param('id') respuestaId: string, @Res({ passthrough: true }) res: Response) {
    res.set({ 'Cache-Control': 'no-store' });
    return this.asistente.borrador.borrador(u.sub, respuestaId);
  }
}
