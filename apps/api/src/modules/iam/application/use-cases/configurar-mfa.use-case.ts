import { BusEventos, crearEvento, NoEncontradoError } from '../../../shared-kernel/public-api';
import { CodigoMfaInvalidoError, DatoInvalidoError, SesionInvalidaError } from '../../domain/errors/errores-iam';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Reloj, SesionEmitida } from '../dto/iam.dto';
import { CuentaRepository } from '../ports/cuenta.repository';
import { SesionRepository } from '../ports/sesion.repository';
import { TokenService } from '../ports/token.service';
import { TotpService } from '../ports/totp.service';
import { EmisorSesiones } from '../services/emisor-sesiones';

/**
 * Use Case: ConfigurarMfa (RF-011, paso 2). Confirma el secreto con un código de la app,
 * activa MFA y eleva la sesión actual (nuevo access token con mfa = true).
 */
export class ConfigurarMfaUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly sesiones: SesionRepository,
    private readonly totp: TotpService,
    private readonly tokens: TokenService,
    private readonly emisor: EmisorSesiones,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { cuentaId: string; sesionId: string; codigo: string }): Promise<SesionEmitida> {
    const cuenta = await this.cuentas.buscarPorId(entrada.cuentaId);
    if (!cuenta) {
      throw new NoEncontradoError('Cuenta');
    }
    const pendiente = cuenta.mfaSecretPendiente;
    if (!pendiente) {
      throw new DatoInvalidoError('Primero genera el código QR de configuración');
    }
    if (!this.totp.verificar(pendiente, entrada.codigo)) {
      throw new CodigoMfaInvalidoError();
    }
    cuenta.confirmarMfa();
    await this.cuentas.guardar(cuenta);

    const ahora = this.ahora();
    const sesion = await this.sesiones.buscarPorId(entrada.sesionId);
    if (!sesion || !sesion.estaViva(ahora)) {
      throw new SesionInvalidaError();
    }
    const refreshToken = this.tokens.generarTokenOpaco();
    sesion.marcarMfaVerificado();
    sesion.rotarRefreshToken(this.tokens.huella(refreshToken), ahora);
    await this.sesiones.guardar(sesion);

    await this.bus.publicar([
      crearEvento(EVENTOS_IAM.MFA_CONFIGURADO, cuenta.id, { actorId: cuenta.id }, ahora),
    ]);
    return this.emisor.emitir(sesion, refreshToken);
  }
}
