import { ProhibidoError, ResolutorContextoAula } from '../../../shared-kernel/public-api';
import { Reloj } from '../dto/iam.dto';
import { DispositivoRepository } from '../ports/dispositivo.repository';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { TokenService } from '../ports/token.service';
import { CodigoAulaInvalidoError } from '../../domain/errors/errores-iam';

export interface AvatarIngreso {
  id: string;
  alias: string;
  avatar: string;
}

/**
 * Use Case: ContextoIngreso (RF-007, RN-04). Sin contexto válido no se muestran avatares;
 * con él, solo alias y avatar de los estudiantes activos del aula o de la familia.
 */
export class ContextoIngresoUseCase {
  constructor(
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly dispositivos: DispositivoRepository,
    private readonly contextoAula: ResolutorContextoAula,
    private readonly tokens: TokenService,
    private readonly ahora: Reloj,
  ) {}

  async deAula(codigo: string): Promise<{ aula: { nombre: string }; estudiantes: AvatarIngreso[] }> {
    const aula = await this.contextoAula.aulaActivaPorCodigo(codigo.trim().toUpperCase());
    if (!aula) throw new CodigoAulaInvalidoError();
    const perfiles = await this.perfiles.buscarPorIds(await this.contextoAula.estudiantesActivos(aula.aulaId));
    return { aula: { nombre: aula.nombre }, estudiantes: this.avatares(perfiles) };
  }

  async deDispositivo(tokenDispositivo: string | undefined): Promise<AvatarIngreso[]> {
    const dispositivo = tokenDispositivo
      ? await this.dispositivos.buscarPorHashToken(this.tokens.huella(tokenDispositivo))
      : null;
    if (!dispositivo || !dispositivo.estaVigente(this.ahora())) {
      throw new ProhibidoError('Este dispositivo no está vinculado. Pide a un adulto que lo vincule.');
    }
    return this.avatares(await this.perfiles.listarPorResponsable(dispositivo.cuentaId));
  }

  private avatares(perfiles: { id: string; alias: string; avatar: string; activo: boolean }[]): AvatarIngreso[] {
    return perfiles
      .filter((p) => p.activo)
      .map((p) => ({ id: p.id, alias: p.alias, avatar: p.avatar }))
      .sort((a, b) => a.alias.localeCompare(b.alias, 'es'));
  }
}
