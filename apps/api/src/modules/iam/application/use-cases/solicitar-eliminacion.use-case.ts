import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Reloj } from '../dto/iam.dto';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { SesionRepository } from '../ports/sesion.repository';
import { cargarPerfilPropio } from '../services/perfiles';

/**
 * Use Case: SolicitarEliminacion (RF-013, derecho de cancelación ARCO).
 * Borra los datos personales de inmediato (el SRS permite hasta 10 días hábiles) y publica
 * el evento para que los demás módulos borren textos libres; las métricas quedan anonimizadas.
 */
export class SolicitarEliminacionUseCase {
  constructor(
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly sesiones: SesionRepository,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { cuentaId: string; perfilId: string }): Promise<{ eliminadoEn: string }> {
    const ahora = this.ahora();
    const perfil = await cargarPerfilPropio(this.perfiles, entrada.perfilId, entrada.cuentaId);

    perfil.anonimizar(ahora);
    await this.perfiles.guardar(perfil);
    await this.sesiones.revocarTodasDe(perfil.id, ahora);

    await this.bus.publicar([
      crearEvento(EVENTOS_IAM.PERFIL_ELIMINADO, perfil.id, { actorId: entrada.cuentaId }, ahora),
    ]);
    return { eliminadoEn: ahora.toISOString() };
  }
}
