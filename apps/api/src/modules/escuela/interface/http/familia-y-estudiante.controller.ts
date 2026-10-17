import { Body, Controller, Get, Inject, Ip, Param, Post } from '@nestjs/common';

import { LimiteTasa, Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_ESCUELA, CasosUsoEscuela } from '../../application/casos-uso-escuela';
import { CanjearInvitacionRequestDto } from '../dto/escuela.request.dto';

/**
 * Adaptador primario: lo que Escuela ofrece fuera del modo escuela — la invitación familiar
 * (RF-019) y las misiones del docente en la aventura del estudiante (RF-018).
 */
@Controller()
export class FamiliaYEstudianteController {
  constructor(@Inject(CASOS_USO_ESCUELA) private readonly escuela: CasosUsoEscuela) {}

  /** RF-019: código de un solo uso (7 días) para un familiar del estudiante. Se muestra una vez. */
  @Roles('DOCENTE')
  @Post('estudiantes/:id/invitaciones-familiar')
  invitarFamiliar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') estudianteId: string, @Ip() ip: string) {
    return this.escuela.generarInvitacion.ejecutar({ docenteId: u.sub, estudianteId, ip });
  }

  /** RF-019: el familiar canjea el código. Límite de intentos para que no se puedan adivinar. */
  @Roles('FAMILIAR')
  @Post('familia/vincular')
  @LimiteTasa({ nombre: 'vincular-familia', maximoPorMinuto: 10, por: 'ip' })
  vincular(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: CanjearInvitacionRequestDto, @Ip() ip: string) {
    return this.escuela.canjearInvitacion.ejecutar({ cuentaFamiliarId: u.sub, codigo: dto.codigo, ip });
  }

  /** RF-018: "Misión del docente" — asignaciones en curso del estudiante. */
  @Roles('ESTUDIANTE')
  @Get('yo/asignaciones')
  misAsignaciones(@UsuarioActual() u: UsuarioAutenticado) {
    return this.escuela.misionesDelDocente.ejecutar(u.sub);
  }
}
