import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { responderSesion } from '../../../iam/public-api';
import { LimiteTasa, Publico, Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_ESCUELA, CasosUsoEscuela } from '../../application/casos-uso-escuela';
import {
  CrearAulaRequestDto,
  IngresoAulaRequestDto,
  MatricularCsvRequestDto,
  MatricularRequestDto,
  TarjetasRequestDto,
} from '../dto/escuela.request.dto';

/**
 * Adaptador primario: EscuelaController — modo escuela del docente (RF-014 a RF-020)
 * e ingreso de estudiantes con código de aula (RF-007).
 */
@Controller('escuela')
export class EscuelaController {
  constructor(@Inject(CASOS_USO_ESCUELA) private readonly escuela: CasosUsoEscuela) {}

  /** RF-014 */
  @Roles('DOCENTE')
  @Post('aulas')
  crearAula(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: CrearAulaRequestDto) {
    return this.escuela.crearAula.ejecutar({ docenteId: u.sub, ...dto });
  }

  @Roles('DOCENTE')
  @Get('aulas')
  listarAulas(@UsuarioActual() u: UsuarioAutenticado) {
    return this.escuela.listarAulas.ejecutar(u.sub);
  }

  @Roles('DOCENTE')
  @Get('aulas/:id')
  detalleAula(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string) {
    return this.escuela.detalleAula.ejecutar({ docenteId: u.sub, aulaId });
  }

  /** RF-015: devuelve la tarjeta de acceso con el PIN generado (solo esta vez). */
  @Roles('DOCENTE')
  @Post('aulas/:id/estudiantes')
  matricular(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Body() dto: MatricularRequestDto) {
    return this.escuela.matricular.uno({ docenteId: u.sub, aulaId, ...dto });
  }

  /** RF-016: hasta 60 filas; responde las tarjetas creadas y las filas rechazadas con su motivo. */
  @Roles('DOCENTE')
  @Post('aulas/:id/estudiantes/csv')
  matricularCsv(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Body() dto: MatricularCsvRequestDto) {
    return this.escuela.matricular.desdeCsv({ docenteId: u.sub, aulaId, csv: dto.csv });
  }

  /** RF-017: asigna PIN nuevos y devuelve los datos de las tarjetas para imprimir. */
  @Roles('DOCENTE')
  @Post('aulas/:id/tarjetas')
  @HttpCode(200)
  tarjetas(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Body() dto: TarjetasRequestDto) {
    return this.escuela.generarTarjetas.ejecutar({ docenteId: u.sub, aulaId, estudianteIds: dto.estudianteIds });
  }

  @Roles('DOCENTE')
  @Delete('aulas/:id/estudiantes/:estudianteId')
  retirar(
    @UsuarioActual() u: UsuarioAutenticado,
    @Param('id') aulaId: string,
    @Param('estudianteId') estudianteId: string,
  ) {
    return this.escuela.retirarEstudiante.ejecutar({ docenteId: u.sub, aulaId, estudianteId });
  }

  /** RF-020 */
  @Roles('DOCENTE')
  @Post('aulas/:id/archivar')
  @HttpCode(200)
  archivar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string) {
    return this.escuela.archivarAula.ejecutar({ docenteId: u.sub, aulaId });
  }

  // ── Ingreso del estudiante en el aula (RF-007, RN-04) ──────────────────────

  @Publico()
  @Get('ingreso/:codigo')
  contextoIngreso(@Param('codigo') codigo: string) {
    return this.escuela.contextoIngreso.ejecutar(codigo);
  }

  /** RNF-019: 30 intentos de PIN por minuto por código de aula (además de 5 por perfil). */
  @Publico()
  @LimiteTasa({ nombre: 'ingreso-aula', maximoPorMinuto: 30, por: { campoCuerpo: 'codigoAula' } })
  @Post('ingreso')
  @HttpCode(200)
  async ingresar(@Body() dto: IngresoAulaRequestDto, @Res({ passthrough: true }) res: Response) {
    return responderSesion(res, await this.escuela.ingresarEnAula.ejecutar(dto));
  }
}
