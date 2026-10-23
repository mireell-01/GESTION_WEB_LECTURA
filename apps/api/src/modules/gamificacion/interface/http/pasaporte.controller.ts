import { Controller, Get, Inject, Param, Post } from '@nestjs/common';

import { Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_GAMIFICACION, CasosUsoGamificacion } from '../../application/casos-uso-gamificacion';

/**
 * Adaptador primario: el Pasaporte del Lector, el reto del día y las recompensas del estudiante —
 * `/api/v1/yo/*` (SAD §7, RF-056 a RF-062). Solo el propio estudiante, con la sesión de su avatar y PIN.
 */
@Controller('yo')
@Roles('ESTUDIANTE')
export class PasaporteController {
  constructor(@Inject(CASOS_USO_GAMIFICACION) private readonly gamificacion: CasosUsoGamificacion) {}

  /** RF-057, RF-059: puntos, nivel, insignias, mundos completados, lecturas, racha y monedas. */
  @Get('pasaporte')
  pasaporte(@UsuarioActual() u: UsuarioAutenticado) {
    return this.gamificacion.pasaporte.pasaporte(u.sub);
  }

  /** RF-060, RN-18: el reto de hoy, orientado a su habilidad más débil. */
  @Get('reto-del-dia')
  retoDelDia(@UsuarioActual() u: UsuarioAutenticado) {
    return this.gamificacion.pasaporte.retoDelDia(u.sub);
  }

  /** RF-062: canjea un personaje o accesorio con monedas de recompensa. */
  @Post('recompensas/:id/canje')
  canjear(@UsuarioActual() u: UsuarioAutenticado, @Param('id') id: string) {
    return this.gamificacion.pasaporte.canjear(u.sub, id);
  }
}
