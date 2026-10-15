import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { EnlaceInvalidoError } from '../../domain/errors/enlace-invalido-error';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Reloj } from '../dto/iam.dto';
import { CuentaRepository } from '../ports/cuenta.repository';
import { TokenService } from '../ports/token.service';
import { VerificacionRepository } from '../ports/verificacion.repository';

/**
 * Use Case: VerificarCorreo (RF-002). Enlace usado o vencido devuelve error;
 * la cuenta pasa a ACTIVA al verificar.
 */
export class VerificarCorreoUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly verificaciones: VerificacionRepository,
    private readonly tokens: TokenService,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(codigo: string): Promise<{ ok: true }> {
    const verificacion = await this.verificaciones.buscarPorCodigo(this.tokens.huella(codigo), 'CORREO');
    const ahora = this.ahora();
    if (!verificacion || !verificacion.canjear(ahora)) {
      throw new EnlaceInvalidoError();
    }
    await this.verificaciones.guardar(verificacion);

    const cuenta = await this.cuentas.buscarPorId(verificacion.cuentaId);
    if (!cuenta) {
      throw new EnlaceInvalidoError();
    }
    cuenta.verificar();
    await this.cuentas.guardar(cuenta);

    await this.bus.publicar([
      crearEvento(EVENTOS_IAM.CUENTA_VERIFICADA, cuenta.id, { actorId: cuenta.id }, ahora),
    ]);
    return { ok: true };
  }
}
