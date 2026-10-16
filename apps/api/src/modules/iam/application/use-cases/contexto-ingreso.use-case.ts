import { ProhibidoError, ResolutorContextoAula } from '../../../shared-kernel/public-api';
import { Reloj } from '../dto/iam.dto';
import { DispositivoRepository } from '../ports/dispositivo.repository';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { TokenService } from '../ports/token.service';

export interface AvatarIngreso {
  id: string;
  alias: string;
  avatar: string;
}

export interface ContextoDeIngreso {
  contexto: { tipo: 'FAMILIA' | 'AULA'; nombre: string };
  estudiantes: AvatarIngreso[];
}

const SIN_ACTIVAR = 'Esta tablet no está activada. Pide a tu profe o a tu familia que la active.';

/**
 * Use Case: ContextoIngreso (RF-007, RN-04, CR-01). Sin dispositivo activado no se muestran
 * avatares; con él, solo alias y avatar de los niños activos de esa familia o de esa aula.
 */
export class ContextoIngresoUseCase {
  constructor(
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly dispositivos: DispositivoRepository,
    private readonly contextoAula: ResolutorContextoAula,
    private readonly tokens: TokenService,
    private readonly ahora: Reloj,
  ) {}

  async deDispositivo(tokenDispositivo: string | undefined): Promise<ContextoDeIngreso> {
    const dispositivo = tokenDispositivo
      ? await this.dispositivos.buscarPorHashToken(this.tokens.huella(tokenDispositivo))
      : null;
    if (!dispositivo || !dispositivo.estaVigente(this.ahora())) {
      throw new ProhibidoError(SIN_ACTIVAR);
    }

    const contexto = dispositivo.contexto;
    if (contexto.tipo === 'FAMILIA') {
      return {
        contexto: { tipo: 'FAMILIA', nombre: 'Tu familia' },
        estudiantes: this.avatares(await this.perfiles.listarPorResponsable(dispositivo.cuentaId)),
      };
    }

    // Un aula archivada deja de mostrar avatares aunque la tablet siga activada.
    const aula = await this.contextoAula.aulaActiva(contexto.aulaId);
    if (!aula) throw new ProhibidoError(SIN_ACTIVAR);
    const perfiles = await this.perfiles.buscarPorIds(await this.contextoAula.estudiantesActivos(aula.aulaId));
    return { contexto: { tipo: 'AULA', nombre: aula.nombre }, estudiantes: this.avatares(perfiles) };
  }

  private avatares(perfiles: { id: string; alias: string; avatar: string; activo: boolean }[]): AvatarIngreso[] {
    return perfiles
      .filter((p) => p.activo)
      .map((p) => ({ id: p.id, alias: p.alias, avatar: p.avatar }))
      .sort((a, b) => a.alias.localeCompare(b.alias, 'es'));
  }
}
