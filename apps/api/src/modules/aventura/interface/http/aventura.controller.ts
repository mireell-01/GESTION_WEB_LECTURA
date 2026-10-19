import { Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';

import { Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_AVENTURA, CasosUsoAventura } from '../../application/casos-uso-aventura';

/**
 * Adaptador primario: mapa de aventuras del estudiante — `/api/v1/aventura/*` (SRS §7, RF-030 a
 * RF-033). Solo el propio estudiante, con la sesión de su avatar y PIN.
 */
@Controller('aventura')
@Roles('ESTUDIANTE')
export class AventuraController {
  constructor(@Inject(CASOS_USO_AVENTURA) private readonly aventura: CasosUsoAventura) {}

  /** RF-030, RF-031, RF-033 */
  @Get('mapa')
  mapa(@UsuarioActual() u: UsuarioAutenticado) {
    return this.aventura.mapa.mapa(u.sub);
  }

  /** RF-032 */
  @Get('mundos/:id/misiones')
  misiones(@UsuarioActual() u: UsuarioAutenticado, @Param('id') mundoId: string) {
    return this.aventura.mapa.misiones(u.sub, mundoId);
  }

  /** RF-031: el niño ya vio la celebración del mundo desbloqueado. */
  @Post('mundos/:id/celebracion')
  @HttpCode(204)
  async celebracion(@UsuarioActual() u: UsuarioAutenticado, @Param('id') mundoId: string): Promise<void> {
    await this.aventura.mapa.marcarCelebrado(u.sub, mundoId);
  }
}
