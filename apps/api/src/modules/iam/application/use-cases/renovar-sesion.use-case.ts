import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { SesionInvalidaError } from '../../domain/errors/errores-iam';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Reloj, SesionEmitida } from '../dto/iam.dto';
import { SesionRepository } from '../ports/sesion.repository';
import { TokenService } from '../ports/token.service';
import { EmisorSesiones } from '../services/emisor-sesiones';

/**
 * Use Case: RenovarSesion (RF-003, ADR-005). Cambia un refresh token válido por un access token
 * nuevo y rota el refresh token. Si llega un refresh token que ya fue rotado, alguien lo copió:
 * se revoca toda la sesión (detección de reutilización) y se registra para auditoría.
 */
export class RenovarSesionUseCase {
  constructor(
    private readonly sesiones: SesionRepository,
    private readonly tokens: TokenService,
    private readonly emisor: EmisorSesiones,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(refreshToken: string | undefined): Promise<SesionEmitida> {
    if (!refreshToken) {
      throw new SesionInvalidaError();
    }
    const ahora = this.ahora();
    const huella = this.tokens.huella(refreshToken);
    const sesion = await this.sesiones.buscarPorHashRefreshToken(huella);

    if (!sesion) {
      await this.revocarSiFueReutilizado(huella, ahora);
      throw new SesionInvalidaError();
    }
    if (!sesion.estaViva(ahora)) {
      throw new SesionInvalidaError();
    }

    const nuevo = this.tokens.generarTokenOpaco();
    await this.sesiones.registrarRefreshUsado(huella, sesion.id, ahora);
    sesion.rotarRefreshToken(this.tokens.huella(nuevo), ahora);
    await this.sesiones.guardar(sesion);

    const requiereConfigurarMfa = !sesion.mfa && ['EDITOR', 'REVISOR', 'ADMIN_PLATAFORMA'].includes(sesion.rol);
    return this.emisor.emitir(sesion, nuevo, requiereConfigurarMfa);
  }

  private async revocarSiFueReutilizado(huella: string, ahora: Date): Promise<void> {
    const sesionId = await this.sesiones.sesionDeRefreshUsado(huella);
    if (!sesionId) return;
    const sesion = await this.sesiones.buscarPorId(sesionId);
    if (!sesion || sesion.revocadaEn) return;

    sesion.revocar(ahora);
    await this.sesiones.guardar(sesion);
    await this.bus.publicar([
      crearEvento(EVENTOS_IAM.REUTILIZACION_REFRESH, sesion.id, { actorId: sesion.sujetoId, rol: sesion.rol }, ahora),
    ]);
  }
}
