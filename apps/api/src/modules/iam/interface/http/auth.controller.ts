import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import { LimiteTasa, PermiteSinMfa, Publico, Roles, UsuarioActual, UsuarioAutenticado } from '../../../shared-kernel/public-api';
import { CASOS_USO_IAM, CasosUsoIam } from '../../application/casos-uso-iam';
import {
  AutenticarAdultoRequestDto,
  CodigoMfaRequestDto,
  CodigoRequestDto,
  RecuperarContrasenaRequestDto,
  ReenviarVerificacionRequestDto,
  RegistrarCuentaRequestDto,
  RestablecerContrasenaRequestDto,
} from '../dto/iam.request.dto';
import { borrarCookieRefresh, COOKIE_REFRESH, leerCookie, responderSesion } from './cookies';

/**
 * Adaptador primario: cuentas adultas y sesiones — `/api/v1/auth/*` (SRS §7, RF-001 a RF-004, RF-010, RF-011).
 */
@Controller('auth')
export class AuthController {
  constructor(@Inject(CASOS_USO_IAM) private readonly iam: CasosUsoIam) {}

  /** RF-001 */
  @Publico()
  @Post('registro')
  registrar(@Body() dto: RegistrarCuentaRequestDto) {
    return this.iam.registrarCuenta.ejecutar(dto);
  }

  /** RF-002 */
  @Publico()
  @Post('verificar-correo')
  @HttpCode(200)
  verificarCorreo(@Body() dto: CodigoRequestDto) {
    return this.iam.verificarCorreo.ejecutar(dto.codigo);
  }

  /**
   * RF-002: pedir otro enlace si se perdió o venció. Misma respuesta exista o no la cuenta.
   * RNF-019: 5 por minuto por IP y 1 por minuto por correo (además, 60 s entre enlaces de una cuenta).
   */
  @Publico()
  @LimiteTasa(
    { nombre: 'reenviar-verificacion-ip', maximoPorMinuto: 5, por: 'ip' },
    { nombre: 'reenviar-verificacion-correo', maximoPorMinuto: 1, por: { campoCuerpo: 'email' } },
  )
  @Post('verificar-correo/reenviar')
  @HttpCode(202)
  reenviarVerificacion(@Body() dto: ReenviarVerificacionRequestDto) {
    return this.iam.reenviarVerificacion.ejecutar(dto.email);
  }

  /** RF-003, RF-009, RF-011 · RNF-019: 10 intentos por minuto por IP. */
  @Publico()
  @LimiteTasa({ nombre: 'ingreso-adulto', maximoPorMinuto: 10, por: 'ip' })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: AutenticarAdultoRequestDto, @Res({ passthrough: true }) res: Response) {
    return responderSesion(res, await this.iam.autenticarAdulto.ejecutar(dto));
  }

  /** RF-003, ADR-005: renueva con la cookie httpOnly y la rota; reutilizar una anterior revoca la sesión. */
  @Publico()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return responderSesion(res, await this.iam.renovarSesion.ejecutar(leerCookie(req, COOKIE_REFRESH)));
    } catch (error) {
      borrarCookieRefresh(res);
      throw error;
    }
  }

  /** RF-004: respuesta idéntica exista o no el correo. */
  @Publico()
  @LimiteTasa({ nombre: 'recuperar-contrasena', maximoPorMinuto: 10, por: 'ip' })
  @Post('recuperar')
  @HttpCode(202)
  recuperar(@Body() dto: RecuperarContrasenaRequestDto) {
    return this.iam.recuperarContrasena.ejecutar(dto.email);
  }

  /** RF-004 */
  @Publico()
  @Post('restablecer')
  @HttpCode(200)
  restablecer(@Body() dto: RestablecerContrasenaRequestDto) {
    return this.iam.restablecerContrasena.ejecutar(dto);
  }

  /** RF-011 (paso 1): genera el secreto TOTP y la URL para la app autenticadora. */
  @PermiteSinMfa()
  @Roles('DOCENTE', 'FAMILIAR', 'EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA')
  @Post('mfa/configurar')
  @HttpCode(200)
  configurarMfa(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.iam.iniciarMfa.ejecutar(usuario.sub);
  }

  /** RF-011 (paso 2): confirma el código, activa MFA y eleva la sesión. */
  @PermiteSinMfa()
  @Roles('DOCENTE', 'FAMILIAR', 'EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA')
  @Post('mfa/verificar')
  @HttpCode(200)
  async verificarMfa(
    @UsuarioActual() usuario: UsuarioAutenticado,
    @Body() dto: CodigoMfaRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sesion = await this.iam.configurarMfa.ejecutar({ cuentaId: usuario.sub, sesionId: usuario.sid, codigo: dto.codigo });
    return responderSesion(res, sesion);
  }

  /** RF-010 */
  @PermiteSinMfa()
  @Post('logout')
  @HttpCode(200)
  async logout(@UsuarioActual() usuario: UsuarioAutenticado, @Res({ passthrough: true }) res: Response) {
    borrarCookieRefresh(res);
    return this.iam.cerrarSesion.ejecutar(usuario.sid);
  }

  /** Datos mínimos del usuario autenticado para personalizar la interfaz. */
  @PermiteSinMfa()
  @Get('yo')
  yo(@UsuarioActual() usuario: UsuarioAutenticado) {
    return this.iam.obtenerUsuarioActual.ejecutar(usuario);
  }
}
