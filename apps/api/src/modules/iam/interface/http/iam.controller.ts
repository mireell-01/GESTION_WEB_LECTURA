import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  LimiteTasa,
  PermiteSinMfa,
  Publico,
  Roles,
  UsuarioActual,
  UsuarioAutenticado,
} from '../../../shared-kernel/public-api';
import { CASOS_USO_IAM, CasosUsoIam } from '../../application/casos-uso-iam';
import {
  ActualizarPerfilRequestDto,
  AutenticarAdultoRequestDto,
  CodigoMfaRequestDto,
  CodigoRequestDto,
  ConsentimientoParentalRequestDto,
  CrearPerfilRequestDto,
  IngresoEstudianteDispositivoRequestDto,
  RecuperarContrasenaRequestDto,
  RegistrarCuentaRequestDto,
  RestablecerContrasenaRequestDto,
  RestablecerPinRequestDto,
  VincularDispositivoRequestDto,
} from '../dto/iam.request.dto';
import { borrarCookieRefresh, COOKIE_REFRESH, leerCookie, responderSesion } from './cookies';

/**
 * Adaptador primario: IamController — RF-001 a RF-013 como endpoints REST.
 */
@Controller('iam')
export class IamController {
  constructor(@Inject(CASOS_USO_IAM) private readonly iam: CasosUsoIam) {}

  // ── Cuenta adulta ───────────────────────────────────────────────────────────

  /** RF-001 */
  @Publico()
  @Post('cuentas')
  registrar(@Body() dto: RegistrarCuentaRequestDto) {
    return this.iam.registrarCuenta.ejecutar(dto);
  }

  /** RF-002 */
  @Publico()
  @Post('correo/verificar')
  @HttpCode(200)
  verificarCorreo(@Body() dto: CodigoRequestDto) {
    return this.iam.verificarCorreo.ejecutar(dto.codigo);
  }

  /** RF-004: respuesta idéntica exista o no el correo. */
  @Publico()
  @LimiteTasa({ nombre: 'recuperar-contrasena', maximoPorMinuto: 10, por: 'ip' })
  @Post('contrasena/recuperar')
  @HttpCode(202)
  recuperar(@Body() dto: RecuperarContrasenaRequestDto) {
    return this.iam.recuperarContrasena.ejecutar(dto.email);
  }

  /** RF-004 */
  @Publico()
  @Post('contrasena/restablecer')
  @HttpCode(200)
  restablecerContrasena(@Body() dto: RestablecerContrasenaRequestDto) {
    return this.iam.restablecerContrasena.ejecutar(dto);
  }

  // ── Sesiones ────────────────────────────────────────────────────────────────

  /** RF-003, RF-009, RF-011 · RNF-019: 10 intentos por minuto por IP. */
  @Publico()
  @LimiteTasa({ nombre: 'ingreso-adulto', maximoPorMinuto: 10, por: 'ip' })
  @Post('sesiones')
  @HttpCode(200)
  async ingresar(@Body() dto: AutenticarAdultoRequestDto, @Res({ passthrough: true }) res: Response) {
    return responderSesion(res, await this.iam.autenticarAdulto.ejecutar(dto));
  }

  /** RF-003: renueva con el refresh token de la cookie httpOnly y lo rota. */
  @Publico()
  @Post('sesiones/renovar')
  @HttpCode(200)
  async renovar(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return responderSesion(res, await this.iam.renovarSesion.ejecutar(leerCookie(req, COOKIE_REFRESH)));
    } catch (error) {
      borrarCookieRefresh(res);
      throw error;
    }
  }

  /** RF-010 */
  @PermiteSinMfa()
  @Post('sesiones/cerrar')
  @HttpCode(200)
  async cerrar(@UsuarioActual() usuario: UsuarioAutenticado, @Res({ passthrough: true }) res: Response) {
    borrarCookieRefresh(res);
    return this.iam.cerrarSesion.ejecutar(usuario.sid);
  }

  @PermiteSinMfa()
  @Get('yo')
  yo(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.iam.obtenerUsuarioActual.ejecutar(usuario);
  }

  // ── MFA (RF-011) ────────────────────────────────────────────────────────────

  @PermiteSinMfa()
  @Roles('DOCENTE', 'FAMILIAR', 'EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA')
  @Post('mfa/iniciar')
  @HttpCode(200)
  iniciarMfa(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.iam.iniciarMfa.ejecutar(usuario.sub);
  }

  @PermiteSinMfa()
  @Roles('DOCENTE', 'FAMILIAR', 'EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA')
  @Post('mfa/confirmar')
  @HttpCode(200)
  async confirmarMfa(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: CodigoMfaRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sesion = await this.iam.configurarMfa.ejecutar({ cuentaId: usuario.sub, sesionId: usuario.sid, codigo: dto.codigo });
    return responderSesion(res, sesion);
  }

  // ── Consentimiento y perfiles de estudiante ────────────────────────────────

  /** RF-005 */
  @Roles('FAMILIAR')
  @Post('consentimientos')
  consentir(@UsuarioActual() usuario: UsuarioAutenticado, @Body() dto: ConsentimientoParentalRequestDto) {
    return this.iam.registrarConsentimiento.ejecutar({
      cuentaResponsableId: usuario.sub,
      tipo: 'PARENTAL',
      otorganteNombre: dto.otorganteNombre,
      medio: 'DIGITAL',
    });
  }

  @Roles('FAMILIAR')
  @Get('consentimientos/vigente')
  async consentimientoVigente(@UsuarioActual() usuario: UsuarioAutenticado) {
    const c = await this.iam.consentimientos.buscarParentalVigente(usuario.sub);
    return {
      vigente: !!c,
      versionPolitica: c?.versionPolitica ?? null,
      otorgadoEn: c?.otorgadoEn.toISOString() ?? null,
      otorgante: c?.otorganteNombre ?? null,
    };
  }

  @Roles('FAMILIAR', 'DOCENTE')
  @Get('perfiles-estudiante')
  listarPerfiles(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.iam.listarPerfiles.ejecutar(usuario.sub);
  }

  /** RF-006, RF-071 */
  @Roles('FAMILIAR')
  @Post('perfiles-estudiante')
  crearPerfil(@UsuarioActual() usuario: UsuarioAutenticado, @Body() dto: CrearPerfilRequestDto) {
    return this.iam.crearPerfil.ejecutar({ cuentaResponsableId: usuario.sub, ...dto });
  }

  /** RF-071 */
  @Roles('FAMILIAR', 'DOCENTE')
  @Patch('perfiles-estudiante/:id')
  actualizarPerfil(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id') perfilId: string,
    @Body() dto: ActualizarPerfilRequestDto,
  ) {
    return this.iam.actualizarPerfil.ejecutar({ cuentaId: usuario.sub, perfilId, ...dto });
  }

  /** RF-008 */
  @Roles('FAMILIAR', 'DOCENTE')
  @Post('perfiles-estudiante/:id/pin')
  @HttpCode(200)
  restablecerPin(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id') perfilId: string,
    @Body() dto: RestablecerPinRequestDto,
  ) {
    return this.iam.restablecerPin.ejecutar({ cuentaId: usuario.sub, perfilId, pinNuevo: dto.pinNuevo });
  }

  /** RF-012: descarga JSON con los datos personales y de progreso. */
  @Roles('FAMILIAR', 'DOCENTE')
  @Get('perfiles-estudiante/:id/exportacion')
  async exportar(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Param('id') perfilId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const datos = await this.iam.exportarDatos.ejecutar({ cuentaId: usuario.sub, perfilId });
    res.setHeader('Content-Disposition', `attachment; filename="lectoaventura-datos-${perfilId}.json"`);
    return datos;
  }

  /** RF-013 */
  @Roles('FAMILIAR', 'DOCENTE')
  @Delete('perfiles-estudiante/:id')
  eliminarPerfil(@UsuarioActual() usuario: UsuarioAutenticado, @Param('id') perfilId: string) {
    return this.iam.solicitarEliminacion.ejecutar({ cuentaId: usuario.sub, perfilId });
  }

  // ── Ingreso del estudiante en casa (RF-007, RN-04) ─────────────────────────

  @Roles('FAMILIAR')
  @Post('dispositivos')
  vincularDispositivo(@UsuarioActual() usuario: UsuarioAutenticado, @Body() dto: VincularDispositivoRequestDto) {
    return this.iam.vincularDispositivo.ejecutar({ cuentaId: usuario.sub, nombre: dto.nombre });
  }

  /** Sin un dispositivo vinculado no se muestran avatares. */
  @Publico()
  @Get('dispositivo/perfiles')
  perfilesDispositivo(@Headers('x-dispositivo') token: string | undefined) {
    return this.iam.perfilesDeDispositivo.ejecutar(token);
  }

  /** RNF-019: además de los 5 intentos por perfil, 30 intentos por minuto por dispositivo (IP). */
  @Publico()
  @LimiteTasa({ nombre: 'ingreso-estudiante-casa', maximoPorMinuto: 30, por: 'ip' })
  @Post('sesiones/estudiante')
  @HttpCode(200)
  async ingresarEstudiante(
    @Body() dto: IngresoEstudianteDispositivoRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sesion = await this.iam.autenticarEstudiante.ejecutar({
      perfilId: dto.perfilId,
      pin: dto.pin,
      contexto: { tipo: 'DISPOSITIVO', tokenDispositivo: dto.tokenDispositivo },
    });
    return responderSesion(res, sesion);
  }

  // ── Desarrollo ──────────────────────────────────────────────────────────────

  /** Bandeja de correos de desarrollo (solo sin SMTP y fuera de producción). */
  @Publico()
  @Get('dev/correos')
  correosDesarrollo() {
    if (!this.iam.bandejaDesarrollo || process.env['NODE_ENV'] === 'production') {
      throw new NotFoundException();
    }
    return this.iam.bandejaDesarrollo.correos();
  }
}
