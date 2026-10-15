import { ProhibidoError } from '../../../shared-kernel/public-api';
import { Reloj } from '../dto/iam.dto';
import { DispositivoRepository } from '../ports/dispositivo.repository';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { TokenService } from '../ports/token.service';

/**
 * Use Case: PerfilesDeDispositivo (RF-007). Sin contexto válido no se muestran avatares;
 * con él, solo alias y avatar de los perfiles activos de esa familia.
 */
export class PerfilesDeDispositivoUseCase {
  constructor(
    private readonly dispositivos: DispositivoRepository,
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly tokens: TokenService,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(tokenDispositivo: string | undefined): Promise<{ id: string; alias: string; avatar: string }[]> {
    const dispositivo = tokenDispositivo
      ? await this.dispositivos.buscarPorHashToken(this.tokens.huella(tokenDispositivo))
      : null;
    if (!dispositivo || !dispositivo.estaVigente(this.ahora())) {
      throw new ProhibidoError('Este dispositivo no está vinculado. Pide a un adulto que lo vincule.');
    }
    const perfiles = await this.perfiles.listarPorResponsable(dispositivo.cuentaId);
    return perfiles.filter((p) => p.activo).map((p) => ({ id: p.id, alias: p.alias, avatar: p.avatar }));
  }
}
