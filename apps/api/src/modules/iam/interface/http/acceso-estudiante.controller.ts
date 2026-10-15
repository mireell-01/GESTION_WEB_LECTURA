import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { ErrorDeNegocio, LimiteTasa, Publico } from '../../../shared-kernel/public-api';
import { CASOS_USO_IAM, CasosUsoIam } from '../../application/casos-uso-iam';
import { IngresoEstudianteRequestDto } from '../dto/iam.request.dto';
import { responderSesion } from './cookies';

/**
 * Adaptador primario: ingreso del estudiante — `/api/v1/acceso-estudiante/*` (SRS §7, RF-007, RF-008).
 * Público y con límite de tasa (RNF-019): 30 por minuto por código de aula y por dispositivo (IP).
 */
@Controller('acceso-estudiante')
export class AccesoEstudianteController {
  constructor(@Inject(CASOS_USO_IAM) private readonly iam: CasosUsoIam) {}

  /** RN-04: avatares del aula, solo con un código vigente. */
  @Publico()
  @LimiteTasa({ nombre: 'contexto-aula', maximoPorMinuto: 30, por: 'ip' })
  @Get('contexto/:codigoAula')
  contextoAula(@Param('codigoAula') codigoAula: string) {
    return this.iam.contextoIngreso.deAula(codigoAula);
  }

  /** RN-04: avatares de la familia, solo desde un dispositivo vinculado. */
  @Publico()
  @Get('contexto-dispositivo')
  contextoDispositivo(@Headers('x-dispositivo') token: string | undefined) {
    return this.iam.contextoIngreso.deDispositivo(token);
  }

  /** RF-007, RF-008: contexto + avatar + PIN → token de alcance ESTUDIANTE. */
  @Publico()
  @LimiteTasa(
    { nombre: 'ingreso-estudiante-ip', maximoPorMinuto: 30, por: 'ip' },
    { nombre: 'ingreso-estudiante-aula', maximoPorMinuto: 30, por: { campoCuerpo: 'codigoAula' } },
  )
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: IngresoEstudianteRequestDto, @Res({ passthrough: true }) res: Response) {
    if (!!dto.codigoAula === !!dto.tokenDispositivo) {
      throw new ErrorDeNegocio('Indica un solo contexto: el código de aula o el dispositivo de casa', 'VALIDACION');
    }
    const sesion = await this.iam.autenticarEstudiante.ejecutar({
      perfilId: dto.perfilId,
      pin: dto.pin,
      contexto: dto.codigoAula
        ? { tipo: 'AULA', codigoAula: dto.codigoAula }
        : { tipo: 'DISPOSITIVO', tokenDispositivo: dto.tokenDispositivo as string },
    });
    return responderSesion(res, sesion);
  }
}
