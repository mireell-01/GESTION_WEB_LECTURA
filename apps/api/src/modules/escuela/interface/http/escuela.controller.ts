import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';

import { Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_ESCUELA, CasosUsoEscuela } from '../../application/casos-uso-escuela';
import {
  CrearAulaRequestDto,
  MatricularCsvRequestDto,
  MatricularRequestDto,
  TarjetasRequestDto,
} from '../dto/escuela.request.dto';

/**
 * Adaptador primario: modo escuela del docente — `/api/v1/aulas/*` (SRS §7, RF-014 a RF-020).
 * El ingreso de estudiantes con código de aula está en IAM (`/acceso-estudiante`).
 */
@Controller('aulas')
@Roles('DOCENTE')
export class EscuelaController {
  constructor(@Inject(CASOS_USO_ESCUELA) private readonly escuela: CasosUsoEscuela) {}

  /** RF-014 */
  @Post()
  crearAula(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: CrearAulaRequestDto) {
    return this.escuela.crearAula.ejecutar({ docenteId: u.sub, ...dto });
  }

  @Get()
  listarAulas(@UsuarioActual() u: UsuarioAutenticado) {
    return this.escuela.listarAulas.ejecutar(u.sub);
  }

  @Get(':id')
  detalleAula(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string) {
    return this.escuela.detalleAula.ejecutar({ docenteId: u.sub, aulaId });
  }

  /** RF-015: devuelve la tarjeta de acceso con el PIN generado (solo esta vez). */
  @Post(':id/matriculas')
  matricular(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Body() dto: MatricularRequestDto) {
    return this.escuela.matricular.uno({ docenteId: u.sub, aulaId, ...dto });
  }

  /** RF-016: hasta 60 filas; responde las tarjetas creadas y las filas rechazadas con su motivo. */
  @Post(':id/matriculas/importacion')
  matricularCsv(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Body() dto: MatricularCsvRequestDto) {
    return this.escuela.matricular.desdeCsv({ docenteId: u.sub, aulaId, csv: dto.csv });
  }

  /** RF-017: asigna PIN nuevos y devuelve los datos de las tarjetas para imprimir. */
  @Post(':id/tarjetas-acceso')
  @HttpCode(200)
  tarjetas(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Body() dto: TarjetasRequestDto) {
    return this.escuela.generarTarjetas.ejecutar({ docenteId: u.sub, aulaId, estudianteIds: dto.estudianteIds });
  }

  @Delete(':id/matriculas/:estudianteId')
  retirar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string, @Param('estudianteId') estudianteId: string) {
    return this.escuela.retirarEstudiante.ejecutar({ docenteId: u.sub, aulaId, estudianteId });
  }

  /** RF-020 */
  @Post(':id/archivar')
  @HttpCode(200)
  archivar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') aulaId: string) {
    return this.escuela.archivarAula.ejecutar({ docenteId: u.sub, aulaId });
  }
}
