import { Controller, Get, Inject, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

import { Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_CONTENIDO, CasosUsoContenido } from '../../application/casos-uso-contenido';
import { BibliotecaQueryDto } from '../dto/contenido.request.dto';

/**
 * Adaptador primario: biblioteca — `GET /api/v1/biblioteca` (SRS §7, RF-028). Estudiantes y adultos
 * exploran lo publicado; nunca se envían respuestas, pistas ni explicaciones.
 */
@Controller('biblioteca')
@Roles('ESTUDIANTE', 'FAMILIAR', 'DOCENTE', 'EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA')
export class BibliotecaController {
  constructor(@Inject(CASOS_USO_CONTENIDO) private readonly contenido: CasosUsoContenido) {}

  @Get()
  explorar(@UsuarioActual() u: UsuarioAutenticado, @Query() filtros: BibliotecaQueryDto) {
    return this.contenido.biblioteca.explorar(u, filtros);
  }

  /** Imágenes de lecturas publicadas (para leer). */
  @Get('recursos/:id')
  async recurso(@Param('id') recursoId: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { datos, tipoMime } = await this.contenido.recursos.archivo(recursoId, true);
    // Inmutable: un recurso publicado nunca cambia (RN-14).
    res.set({ 'Cache-Control': 'private, max-age=86400, immutable', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(datos, { type: tipoMime });
  }

  @Get(':id')
  detalle(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string) {
    return this.contenido.biblioteca.detalle(u, lecturaId);
  }
}
