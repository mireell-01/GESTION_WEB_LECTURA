import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query } from '@nestjs/common';

import { LimiteTasa, Publico, Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_REPORTING, CasosUsoReporting } from '../../application/casos-uso-reporting';
import { EnlaceBajaRequestDto, PreferenciasFamiliaRequestDto } from '../dto/familia.request.dto';

/**
 * Adaptador primario: el acompañamiento familiar — `/api/v1/familia/*` (SAD §7, RF-068 a RF-070). El
 * panel solo de los hijos vinculados a la cuenta (RN-17): cualquier otro responde 404.
 */
@Controller('familia')
export class AcompanamientoFamiliarController {
  constructor(@Inject(CASOS_USO_REPORTING) private readonly reporting: CasosUsoReporting) {}

  /** RF-068, RF-069: avance, tiempo de lectura semanal, habilidades a reforzar y cómo acompañar en casa. */
  @Roles('FAMILIAR')
  @Get('estudiantes/:id/panel')
  panel(@UsuarioActual() u: UsuarioAutenticado, @Param('id') estudianteId: string) {
    return this.reporting.panelHijo.panel(u.sub, estudianteId);
  }

  /** RF-070: si recibe el resumen semanal por correo. */
  @Roles('FAMILIAR')
  @Get('preferencias-notificacion')
  preferencias(@UsuarioActual() u: UsuarioAutenticado) {
    return this.reporting.preferencias.consultar(u.sub);
  }

  @Roles('FAMILIAR')
  @Patch('preferencias-notificacion')
  cambiar(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: PreferenciasFamiliaRequestDto) {
    return this.reporting.preferencias.cambiar(u.sub, dto.resumenSemanal);
  }

  /** RF-070: baja con un clic desde el correo, sin iniciar sesión (el enlace va firmado). */
  @Publico()
  @LimiteTasa({ nombre: 'baja-resumen-familiar', maximoPorMinuto: 20, por: 'ip' })
  @Post('preferencias-notificacion/baja')
  @HttpCode(200)
  baja(@Body() dto: EnlaceBajaRequestDto, @Query('token') tokenUrl?: string) {
    return this.reporting.preferencias.porEnlace(dto.token ?? tokenUrl ?? '', false);
  }

  /** Deshacer la baja desde la misma página del enlace. */
  @Publico()
  @LimiteTasa({ nombre: 'baja-resumen-familiar', maximoPorMinuto: 20, por: 'ip' })
  @Post('preferencias-notificacion/alta')
  @HttpCode(200)
  alta(@Body() dto: EnlaceBajaRequestDto, @Query('token') tokenUrl?: string) {
    return this.reporting.preferencias.porEnlace(dto.token ?? tokenUrl ?? '', true);
  }
}
