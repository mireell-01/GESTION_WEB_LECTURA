import { Sesion } from '../../domain/entities/sesion';
import { PoliticaRutas } from '../../domain/services/politica-rutas';
import { PoliticaSesion } from '../../domain/services/politica-sesion';
import { GeneradorId, Reloj, SesionEmitida } from '../dto/iam.dto';
import { SesionRepository } from '../ports/sesion.repository';
import { TokenService } from '../ports/token.service';

/**
 * Servicio de aplicación: abre sesiones con access token + refresh token rotativo (RF-003).
 * Lo usan el ingreso de adultos, de estudiantes y la confirmación de MFA.
 */
export class EmisorSesiones {
  constructor(
    private readonly sesiones: SesionRepository,
    private readonly tokens: TokenService,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async abrir(params: { sujetoId: string; rol: string; mfa: boolean; requiereConfigurarMfa?: boolean }): Promise<SesionEmitida> {
    const refreshToken = this.tokens.generarTokenOpaco();
    const sesion = Sesion.abrir({
      id: this.generarId(),
      sujetoId: params.sujetoId,
      rol: params.rol,
      mfa: params.mfa,
      hashRefreshToken: this.tokens.huella(refreshToken),
      ahora: this.ahora(),
    });
    await this.sesiones.guardar(sesion);
    return this.emitir(sesion, refreshToken, params.requiereConfigurarMfa ?? false);
  }

  emitir(sesion: Sesion, refreshToken: string, requiereConfigurarMfa = false): SesionEmitida {
    const accessToken = this.tokens.emitirAccessToken({
      sub: sesion.sujetoId,
      rol: sesion.rol,
      mfa: sesion.mfa,
      sid: sesion.id,
    });
    return {
      accessToken,
      refreshToken,
      expiraEnMin: PoliticaSesion.ACCESS_TOKEN_MIN,
      rol: sesion.rol,
      rutaInicial: requiereConfigurarMfa ? '/backoffice/mfa' : PoliticaRutas.rutaInicial(sesion.rol),
      requiereConfigurarMfa,
    };
  }
}
