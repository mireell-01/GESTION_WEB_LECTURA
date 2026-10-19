import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, Res, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ErrorDeNegocio, Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_CONTENIDO, CasosUsoContenido } from '../../application/casos-uso-contenido';
import { RolBackoffice } from '../../application/dto/contenido.dto';
import { ActividadNueva, NodoNuevo } from '../../application/dto/contrato-contenido';
import {
  ActividadesRequestDto,
  BorradorRequestDto,
  CrearLecturaRequestDto,
  DividirRequestDto,
  GrafoRequestDto,
  RechazarRequestDto,
  SolicitarSubidaRequestDto,
} from '../dto/contenido.request.dto';

const actor = (u: UsuarioAutenticado) => ({ id: u.sub, rol: u.rol as RolBackoffice });

/**
 * Adaptador primario: backoffice de contenido — `/api/v1/backoffice/*` (SRS §7, RF-021 a RF-027,
 * RF-029). El editor escribe; el revisor aprueba o devuelve (nunca lo propio). Todas las rutas
 * exigen sesión con MFA verificado (RF-011, guard global de IAM).
 */
@Controller('backoffice')
export class BackofficeLecturasController {
  constructor(@Inject(CASOS_USO_CONTENIDO) private readonly contenido: CasosUsoContenido) {}

  /** RF-021 */
  @Roles('EDITOR')
  @Post('lecturas')
  crear(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: CrearLecturaRequestDto) {
    return this.contenido.autoria.crear({ editorId: u.sub, metadatos: dto.metadatos, texto: dto.texto });
  }

  @Roles('EDITOR', 'REVISOR')
  @Get('lecturas')
  listar(@UsuarioActual() u: UsuarioAutenticado) {
    return this.contenido.publicacion.listar(actor(u));
  }

  @Roles('EDITOR', 'REVISOR')
  @Get('lecturas/:id')
  detalle(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string) {
    return this.contenido.publicacion.detalle(actor(u), lecturaId);
  }

  /** RF-021, RF-022: metadatos y texto (se vuelve a segmentar conservando las oraciones que no cambian). */
  @Roles('EDITOR')
  @Put('lecturas/:id/borrador')
  borrador(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string, @Body() dto: BorradorRequestDto) {
    return this.contenido.autoria.actualizarBorrador({ editorId: u.sub, lecturaId, metadatos: dto.metadatos, texto: dto.texto });
  }

  /** RF-022: el editor ajusta los cortes a mano. */
  @Roles('EDITOR')
  @Post('lecturas/:id/oraciones/:oracionId/unir')
  @HttpCode(200)
  unir(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string, @Param('oracionId') oracionId: string) {
    return this.contenido.autoria.unirOraciones({ editorId: u.sub, lecturaId, oracionId });
  }

  @Roles('EDITOR')
  @Post('lecturas/:id/oraciones/:oracionId/dividir')
  @HttpCode(200)
  dividir(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string, @Param('oracionId') oracionId: string, @Body() dto: DividirRequestDto) {
    return this.contenido.autoria.dividirOracion({ editorId: u.sub, lecturaId, oracionId, posicion: dto.posicion });
  }

  /** RF-024, RF-025 */
  @Roles('EDITOR')
  @Put('lecturas/:id/actividades')
  actividades(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string, @Body() dto: ActividadesRequestDto) {
    return this.contenido.autoria.reemplazarActividades({ editorId: u.sub, lecturaId, actividades: dto.actividades as unknown as ActividadNueva[] });
  }

  /** RF-029 */
  @Roles('EDITOR')
  @Put('lecturas/:id/grafo')
  grafo(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string, @Body() dto: GrafoRequestDto) {
    return this.contenido.autoria.reemplazarGrafo({ editorId: u.sub, lecturaId, nodos: dto.nodos as unknown as NodoNuevo[] });
  }

  /** RF-027: borrador nuevo desde la publicada. */
  @Roles('EDITOR')
  @Post('lecturas/:id/nueva-version')
  nuevaVersion(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string) {
    return this.contenido.autoria.nuevaVersion({ editorId: u.sub, lecturaId });
  }

  /** RF-026 */
  @Roles('EDITOR')
  @Post('lecturas/:id/enviar-revision')
  @HttpCode(200)
  enviar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string) {
    return this.contenido.publicacion.enviarARevision({ editorId: u.sub, lecturaId });
  }

  @Roles('REVISOR')
  @Post('lecturas/:id/aprobar')
  @HttpCode(200)
  aprobar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string) {
    return this.contenido.publicacion.aprobar({ revisorId: u.sub, lecturaId });
  }

  @Roles('REVISOR')
  @Post('lecturas/:id/rechazar')
  @HttpCode(200)
  rechazar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string, @Body() dto: RechazarRequestDto) {
    return this.contenido.publicacion.rechazar({ revisorId: u.sub, lecturaId, comentario: dto.comentario });
  }

  @Roles('EDITOR', 'REVISOR')
  @Post('lecturas/:id/archivar')
  @HttpCode(200)
  archivar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string) {
    return this.contenido.publicacion.archivar({ actor: actor(u), lecturaId });
  }

  /** RF-023, paso 1: declarar el archivo y recibir la URL firmada (10 min). */
  @Roles('EDITOR')
  @Post('recursos')
  solicitarSubida(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: SolicitarSubidaRequestDto) {
    return this.contenido.recursos.solicitarSubida({ editorId: u.sub, ...dto });
  }

  /** RF-023, paso 2: el archivo en binario; se comprueba que sea exactamente lo declarado. */
  @Roles('EDITOR')
  @Put('recursos/:id/archivo')
  subir(@UsuarioActual() u: UsuarioAutenticado, @Param('id') recursoId: string, @Query('token') token: string, @Req() req: Request) {
    if (!Buffer.isBuffer(req.body)) throw new ErrorDeNegocio('Envía el archivo en el cuerpo de la petición', 'VALIDACION');
    return this.contenido.recursos.recibirArchivo({ editorId: u.sub, recursoId, token: token ?? '', archivo: req.body });
  }

  @Roles('EDITOR', 'REVISOR')
  @Get('recursos/:id/archivo')
  async archivo(@Param('id') recursoId: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { datos, tipoMime } = await this.contenido.recursos.archivo(recursoId, false);
    res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(datos, { type: tipoMime });
  }

  @Roles('EDITOR')
  @Delete('lecturas/:id/recursos/:recursoId')
  quitarRecurso(@UsuarioActual() u: UsuarioAutenticado, @Param('id') lecturaId: string, @Param('recursoId') recursoId: string) {
    return this.contenido.recursos.quitar({ editorId: u.sub, lecturaId, recursoId });
  }
}
