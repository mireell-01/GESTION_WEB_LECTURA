import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { EnlaceInvalidoError } from '../../domain/errors/enlace-invalido-error';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Reloj } from '../dto/iam.dto';
import { CuentaRepository } from '../ports/cuenta.repository';
import { TokenService } from '../ports/token.service';
import { VerificacionRepository } from '../ports/verificacion.repository';

/**
 * Use Case: VerificarCorreo (RF-002). La cuenta pasa a ACTIVA al verificar. Explica por qué un
 * enlace no sirve (vencido, reemplazado por uno más nuevo o inválido) y, si la cuenta ya estaba
 * verificada, lo dice en lugar de dar un error.
 */
export class VerificarCorreoUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly verificaciones: VerificacionRepository,
    private readonly tokens: TokenService,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(codigo: string): Promise<{ ok: true; estado: 'VERIFICADA' | 'YA_VERIFICADA' }> {
    const verificacion = await this.verificaciones.buscarPorCodigo(this.tokens.huella(codigo), 'CORREO');
    if (!verificacion) throw new EnlaceInvalidoError('INVALIDO');

    const ahora = this.ahora();
    const estadoEnlace = verificacion.estadoEn(ahora);
    if (estadoEnlace === 'REEMPLAZADO') throw new EnlaceInvalidoError('REEMPLAZADO');
    if (estadoEnlace === 'VENCIDO') throw new EnlaceInvalidoError('VENCIDO');

    const cuenta = await this.cuentas.buscarPorId(verificacion.cuentaId);
    if (!cuenta) throw new EnlaceInvalidoError('INVALIDO');
    if (estadoEnlace === 'USADO') {
      if (cuenta.estaActiva()) return { ok: true, estado: 'YA_VERIFICADA' };
      throw new EnlaceInvalidoError('INVALIDO');
    }

    verificacion.canjear(ahora);
    await this.verificaciones.guardar(verificacion);
    if (cuenta.estaActiva()) return { ok: true, estado: 'YA_VERIFICADA' };

    cuenta.verificar();
    await this.cuentas.guardar(cuenta);
    await this.bus.publicar([
      crearEvento(EVENTOS_IAM.CUENTA_VERIFICADA, cuenta.id, { actorId: cuenta.id }, ahora),
    ]);
    return { ok: true, estado: 'VERIFICADA' };
  }
}
