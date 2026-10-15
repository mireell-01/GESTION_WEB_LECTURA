import { SesionInvalidaError } from '../../domain/errors/errores-iam';
import { Reloj, SesionEmitida } from '../dto/iam.dto';
import { SesionRepository } from '../ports/sesion.repository';
import { TokenService } from '../ports/token.service';
import { EmisorSesiones } from '../services/emisor-sesiones';

/**
 * Use Case: RenovarSesion (RF-003). Cambia un refresh token válido por un access token nuevo
 * y rota el refresh token. Una sesión revocada o vencida por inactividad (RF-010) se rechaza.
 */
export class RenovarSesionUseCase {
  constructor(
    private readonly sesiones: SesionRepository,
    private readonly tokens: TokenService,
    private readonly emisor: EmisorSesiones,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(refreshToken: string | undefined): Promise<SesionEmitida> {
    if (!refreshToken) {
      throw new SesionInvalidaError();
    }
    const ahora = this.ahora();
    const sesion = await this.sesiones.buscarPorHashRefreshToken(this.tokens.huella(refreshToken));
    if (!sesion || !sesion.estaViva(ahora)) {
      throw new SesionInvalidaError();
    }

    const nuevo = this.tokens.generarTokenOpaco();
    sesion.rotarRefreshToken(this.tokens.huella(nuevo), ahora);
    await this.sesiones.guardar(sesion);

    const requiereConfigurarMfa =
      !sesion.mfa && ['EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA'].includes(sesion.rol);
    return this.emisor.emitir(sesion, nuevo, requiereConfigurarMfa);
  }
}
