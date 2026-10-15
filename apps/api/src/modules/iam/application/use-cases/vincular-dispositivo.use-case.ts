import { BusEventos, crearEvento, ProhibidoError } from '../../../shared-kernel/public-api';
import { DispositivoFamiliar } from '../../domain/entities/dispositivo-familiar';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { GeneradorId, Reloj } from '../dto/iam.dto';
import { CuentaRepository } from '../ports/cuenta.repository';
import { DispositivoRepository } from '../ports/dispositivo.repository';
import { TokenService } from '../ports/token.service';

/**
 * Use Case: VincularDispositivo (RF-007, RN-04). El adulto vincula el dispositivo de casa
 * durante 30 días; el token se guarda en el dispositivo y aquí solo su huella.
 */
export class VincularDispositivoUseCase {
  constructor(
    private readonly cuentas: CuentaRepository,
    private readonly dispositivos: DispositivoRepository,
    private readonly tokens: TokenService,
    private readonly bus: BusEventos,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { cuentaId: string; nombre: string }): Promise<{ tokenDispositivo: string; expiraEn: string }> {
    const cuenta = await this.cuentas.buscarPorId(entrada.cuentaId);
    if (!cuenta || cuenta.rol.value !== 'FAMILIAR' || !cuenta.estaActiva()) {
      throw new ProhibidoError('Solo una cuenta familiar puede vincular un dispositivo de casa');
    }

    const ahora = this.ahora();
    const token = this.tokens.generarTokenOpaco();
    const dispositivo = DispositivoFamiliar.vincular({
      id: this.generarId(),
      cuentaId: cuenta.id,
      nombre: entrada.nombre,
      hashToken: this.tokens.huella(token),
      ahora,
    });
    await this.dispositivos.guardar(dispositivo);

    await this.bus.publicar([
      crearEvento(EVENTOS_IAM.DISPOSITIVO_VINCULADO, dispositivo.id, { actorId: cuenta.id }, ahora),
    ]);
    return { tokenDispositivo: token, expiraEn: dispositivo.propsSnapshot.expiraEn.toISOString() };
  }
}
