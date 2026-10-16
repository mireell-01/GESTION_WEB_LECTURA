import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { LimiteTasa, Publico } from '../../../shared-kernel/public-api';
import { CASOS_USO_IAM, CasosUsoIam } from '../../application/casos-uso-iam';
import { IngresoEstudianteRequestDto } from '../dto/iam.request.dto';
import { responderSesion } from './cookies';

/**
 * Adaptador primario: ingreso del estudiante — `/api/v1/acceso-estudiante/*` (SRS §7, RF-007,
 * RF-008, CR-01). Público y con límite de tasa (RNF-019): 30 por minuto por IP y por tablet.
 * El contexto es siempre una tablet activada por un adulto; no existe ingreso por código de aula.
 */
@Controller('acceso-estudiante')
export class AccesoEstudianteController {
  constructor(@Inject(CASOS_USO_IAM) private readonly iam: CasosUsoIam) {}

  /** RN-04: avatares de la familia o del aula, solo desde una tablet activada. */
  @Publico()
  @LimiteTasa({ nombre: 'contexto-dispositivo', maximoPorMinuto: 30, por: 'ip' })
  @Get('contexto-dispositivo')
  contextoDispositivo(@Headers('x-dispositivo') token: string | undefined) {
    return this.iam.contextoIngreso.deDispositivo(token);
  }

  /** RF-007, RF-008: tablet activada + avatar + PIN → token de alcance ESTUDIANTE. */
  @Publico()
  @LimiteTasa(
    { nombre: 'ingreso-estudiante-ip', maximoPorMinuto: 30, por: 'ip' },
    { nombre: 'ingreso-estudiante-tablet', maximoPorMinuto: 30, por: { campoCuerpo: 'tokenDispositivo' } },
  )
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: IngresoEstudianteRequestDto, @Res({ passthrough: true }) res: Response) {
    const sesion = await this.iam.autenticarEstudiante.ejecutar({
      perfilId: dto.perfilId,
      pin: dto.pin,
      tokenDispositivo: dto.tokenDispositivo,
    });
    return responderSesion(res, sesion);
  }
}
