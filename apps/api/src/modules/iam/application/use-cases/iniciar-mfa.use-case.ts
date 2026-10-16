import { NoEncontradoError } from '../../../shared-kernel/public-api';
import { CuentaRepository } from '../ports/cuenta.repository';
import { TotpService } from '../ports/totp.service';

/**
 * Use Case: IniciarMfa (RF-011, paso 1). Genera un secreto TOTP pendiente y la URL
 * otpauth:// para mostrar como código QR. Obligatorio para backoffice, opcional para el resto.
 */
export class IniciarMfaUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly totp: TotpService,
  ) {}

  async ejecutar(cuentaId: string): Promise<{ secreto: string; urlOtpauth: string }> {
    const cuenta = await this.cuentas.buscarPorId(cuentaId);
    if (!cuenta) {
      throw new NoEncontradoError('Cuenta');
    }
    const secreto = this.totp.generarSecreto();
    cuenta.iniciarMfa(secreto);
    await this.cuentas.guardar(cuenta);
    return { secreto, urlOtpauth: this.totp.urlConfiguracion(cuenta.email.value, secreto) };
  }
}
