import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { PerfilEstudianteVista, Reloj } from '../dto/iam.dto';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { SesionRepository } from '../ports/sesion.repository';
import { cargarPerfilPropio, vistaPerfil } from '../services/perfiles';

/**
 * Use Case: ActualizarPerfil (RF-071) — editar alias o avatar y activar/desactivar el perfil.
 * Desactivar cierra las sesiones abiertas del estudiante.
 */
export class ActualizarPerfilUseCase {
  constructor(
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly sesiones: SesionRepository,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: {
    cuentaId: string;
    perfilId: string;
    alias?: string;
    avatar?: string;
    activo?: boolean;
  }): Promise<PerfilEstudianteVista> {
    const ahora = this.ahora();
    const perfil = await cargarPerfilPropio(this.perfiles, entrada.perfilId, entrada.cuentaId);
    perfil.actualizar({ alias: entrada.alias, avatar: entrada.avatar });

    if (entrada.activo === false && perfil.activo) {
      perfil.desactivar();
      await this.sesiones.revocarTodasDe(perfil.id, ahora);
      await this.bus.publicar([
        crearEvento(EVENTOS_IAM.PERFIL_DESACTIVADO, perfil.id, { actorId: entrada.cuentaId }, ahora),
      ]);
    } else if (entrada.activo === true) {
      perfil.reactivar();
    }

    await this.perfiles.guardar(perfil);
    return vistaPerfil(perfil, ahora);
  }
}
