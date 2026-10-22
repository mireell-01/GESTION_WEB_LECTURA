import { Controller, Get, Inject } from '@nestjs/common';

import { Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_PROGRESO, CasosUsoProgreso } from '../../application/casos-uso-progreso';

/**
 * Adaptador primario: el perfil lector y las recomendaciones del estudiante — `/api/v1/yo/*`
 * (SAD §7, RF-052 a RF-055). Solo el propio estudiante, con la sesión de su avatar y PIN.
 */
@Controller('yo')
@Roles('ESTUDIANTE')
export class PerfilLectorController {
  constructor(@Inject(CASOS_USO_PROGRESO) private readonly progreso: CasosUsoProgreso) {}

  /** RF-052, RF-054: las 5 habilidades con su nivel y las que conviene reforzar. */
  @Get('perfil-lector')
  perfil(@UsuarioActual() u: UsuarioAutenticado) {
    return this.progreso.perfil.perfil(u.sub);
  }

  /** RF-055, RN-20: entre 1 y 3 lecturas para seguir. */
  @Get('recomendaciones')
  recomendaciones(@UsuarioActual() u: UsuarioAutenticado) {
    return this.progreso.recomendaciones.recomendaciones(u.sub);
  }
}
