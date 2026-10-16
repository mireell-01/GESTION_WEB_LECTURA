import { CredencialesInvalidasError } from '../../domain/errors/credenciales-invalidas-error';
import {
  CodigoMfaInvalidoError,
  CodigoMfaRequeridoError,
  CuentaNoVerificadaError,
  CuentaSuspendidaError,
} from '../../domain/errors/errores-iam';
import { AutenticarAdultoInput, SesionEmitida } from '../dto/iam.dto';
import { CuentaRepository } from '../ports/cuenta.repository';
import { HashService } from '../ports/hash.service';
import { TotpService } from '../ports/totp.service';
import { EmisorSesiones } from '../services/emisor-sesiones';

/**
 * Use Case: AutenticarAdulto (RF-003, RF-009, RF-011).
 * Emite access token (15 min) + refresh token rotativo. Los roles administrativos sin MFA
 * configurado reciben una sesión limitada que solo sirve para configurarlo.
 */
export class AutenticarAdultoUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly hashService: HashService,
    private readonly totp: TotpService,
    private readonly emisor: EmisorSesiones,
  ) {}

  async ejecutar(entrada: AutenticarAdultoInput): Promise<SesionEmitida> {
    const cuenta = await this.cuentas.buscarPorEmail(entrada.email.trim().toLowerCase());
    if (!cuenta || !(await this.hashService.verificar(entrada.contrasena, cuenta.hashContrasena))) {
      throw new CredencialesInvalidasError();
    }
    if (cuenta.estaSuspendida()) {
      throw new CuentaSuspendidaError();
    }
    if (!cuenta.estaActiva()) {
      throw new CuentaNoVerificadaError();
    }

    if (cuenta.mfaHabilitado) {
      if (!entrada.codigoMfa) {
        throw new CodigoMfaRequeridoError();
      }
      if (!cuenta.mfaSecret || !this.totp.verificar(cuenta.mfaSecret, entrada.codigoMfa)) {
        throw new CodigoMfaInvalidoError();
      }
      return this.emisor.abrir({ sujetoId: cuenta.id, rol: cuenta.rol.value, mfa: true });
    }

    return this.emisor.abrir({
      sujetoId: cuenta.id,
      rol: cuenta.rol.value,
      mfa: false,
      requiereConfigurarMfa: cuenta.rol.requiereMfaObligatorio(),
    });
  }
}
