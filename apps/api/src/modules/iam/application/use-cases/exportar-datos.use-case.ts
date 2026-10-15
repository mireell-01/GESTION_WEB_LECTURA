import { BusEventos, crearEvento, RecolectorDatosEstudiante } from '../../../shared-kernel/public-api';
import { EVENTOS_IAM } from '../../domain/events/eventos-iam';
import { Reloj } from '../dto/iam.dto';
import { ConsentimientoRepository } from '../ports/consentimiento.repository';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { cargarPerfilPropio, vistaPerfil } from '../services/perfiles';

/**
 * Use Case: ExportarDatos (RF-012, derecho de acceso ARCO).
 * Reúne los datos personales (IAM) y los de progreso que aporta cada módulo en un solo JSON.
 */
export class ExportarDatosUseCase {
  constructor(
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly consentimientos: ConsentimientoRepository,
    private readonly recolector: RecolectorDatosEstudiante,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(entrada: { cuentaId: string; perfilId: string }): Promise<Record<string, unknown>> {
    const ahora = this.ahora();
    const perfil = await cargarPerfilPropio(this.perfiles, entrada.perfilId, entrada.cuentaId);
    const [consentimiento] = await this.consentimientos.listarPorIds([perfil.propsSnapshot.consentimientoId]);
    const { bloqueadoHasta: _omitido, ...datosPerfil } = vistaPerfil(perfil, ahora);

    const exportacion = {
      generadoEn: ahora.toISOString(),
      aviso: 'Datos del estudiante en LectoAventura (Ley N.º 29733 de Protección de Datos Personales).',
      perfil: datosPerfil,
      consentimiento: consentimiento
        ? {
            tipo: consentimiento.tipo,
            versionPolitica: consentimiento.versionPolitica,
            otorgadoEn: consentimiento.otorgadoEn.toISOString(),
            otorgante: consentimiento.otorganteNombre,
            medio: consentimiento.medio,
          }
        : null,
      ...(await this.recolector.recolectar(perfil.id)),
    };

    await this.bus.publicar([
      crearEvento(EVENTOS_IAM.DATOS_EXPORTADOS, perfil.id, { actorId: entrada.cuentaId }, ahora),
    ]);
    return exportacion;
  }
}
