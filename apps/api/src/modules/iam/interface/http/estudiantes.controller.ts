import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post } from '@nestjs/common';

import { Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_IAM, CasosUsoIam } from '../../application/casos-uso-iam';
import {
  ActualizarPerfilRequestDto,
  ConsentimientoParentalRequestDto,
  CrearPerfilRequestDto,
  RestablecerPinRequestDto,
  VincularDispositivoRequestDto,
} from '../dto/iam.request.dto';

/**
 * Adaptador primario: consentimiento y perfiles de estudiante (SRS §7, RF-005, RF-006, RF-008,
 * RF-012, RF-013, RF-071). "Responsable" = familiar del perfil o docente del aula (RN-03, RN-17).
 */
@Controller()
export class EstudiantesController {
  constructor(@Inject(CASOS_USO_IAM) private readonly iam: CasosUsoIam) {}

  /**
   * RF-005: consentimiento parental. El institucional lo declara el docente al crear su aula
   * (RF-014/RF-015), porque es el único que puede acreditar que el aula es suya.
   */
  @Roles('FAMILIAR')
  @Post('consentimientos')
  consentir(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: ConsentimientoParentalRequestDto) {
    return this.iam.registrarConsentimiento.ejecutar({
      cuentaResponsableId: u.sub,
      tipo: 'PARENTAL',
      otorganteNombre: dto.otorganteNombre,
      medio: 'DIGITAL',
    });
  }

  @Roles('FAMILIAR')
  @Get('consentimientos/vigente')
  async consentimientoVigente(@UsuarioActual() u: UsuarioAutenticado) {
    const c = await this.iam.consentimientos.buscarParentalVigente(u.sub);
    return {
      vigente: !!c,
      versionPolitica: c?.versionPolitica ?? null,
      otorgadoEn: c?.otorgadoEn.toISOString() ?? null,
      otorgante: c?.otorganteNombre ?? null,
    };
  }

  /** RF-006 (familia). Los estudiantes del aula se matriculan en `/aulas/{id}/matriculas` (RF-015). */
  @Roles('FAMILIAR')
  @Post('estudiantes')
  crear(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: CrearPerfilRequestDto) {
    return this.iam.crearPerfil.ejecutar({ cuentaResponsableId: u.sub, ...dto });
  }

  /** RF-008, RN-03 */
  @Roles('FAMILIAR', 'DOCENTE')
  @Post('estudiantes/:id/pin/restablecer')
  @HttpCode(200)
  restablecerPin(@UsuarioActual() u: UsuarioAutenticado, @Param('id') perfilId: string, @Body() dto: RestablecerPinRequestDto) {
    return this.iam.restablecerPin.ejecutar({ cuentaId: u.sub, perfilId, pinNuevo: dto.pinNuevo });
  }

  /** RF-012: genera JSON + PDF y devuelve enlaces firmados de 72 h. */
  @Roles('FAMILIAR', 'DOCENTE')
  @Post('estudiantes/:id/exportaciones')
  exportar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') perfilId: string) {
    return this.iam.solicitarExportacion.ejecutar({ cuentaId: u.sub, perfilId });
  }

  /** RF-013 */
  @Roles('FAMILIAR', 'DOCENTE')
  @Post('estudiantes/:id/solicitudes-eliminacion')
  eliminar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') perfilId: string) {
    return this.iam.solicitarEliminacion.ejecutar({ cuentaId: u.sub, perfilId });
  }

  /** RF-071: perfiles de la familia. */
  @Roles('FAMILIAR')
  @Get('familia/estudiantes')
  listar(@UsuarioActual() u: UsuarioAutenticado) {
    return this.iam.listarPerfiles.ejecutar(u.sub);
  }

  /** RF-071: editar alias o avatar y activar/desactivar. */
  @Roles('FAMILIAR')
  @Patch('familia/estudiantes/:id')
  actualizar(@UsuarioActual() u: UsuarioAutenticado, @Param('id') perfilId: string, @Body() dto: ActualizarPerfilRequestDto) {
    return this.iam.actualizarPerfil.ejecutar({ cuentaId: u.sub, perfilId, ...dto });
  }

  /** RN-04: vincula el dispositivo de casa por 30 días para el ingreso de los niños. */
  @Roles('FAMILIAR')
  @Post('familia/dispositivos')
  vincularDispositivo(@UsuarioActual() u: UsuarioAutenticado, @Body() dto: VincularDispositivoRequestDto) {
    return this.iam.vincularDispositivo.ejecutar({ cuentaId: u.sub, nombre: dto.nombre });
  }
}
