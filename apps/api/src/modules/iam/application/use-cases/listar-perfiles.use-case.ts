import { PerfilFamiliaVista, Reloj } from '../dto/iam.dto';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { VinculoRepository } from '../ports/vinculo.repository';
import { vistaPerfil } from '../services/perfiles';

/**
 * Use Case: ListarPerfiles (RF-068, RF-071, RN-17) — perfiles de los que la cuenta es responsable
 * y, después, los que acompaña por un vínculo vigente (RF-019).
 */
export class ListarPerfilesUseCase {
  constructor(
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly vinculos: VinculoRepository,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(cuentaId: string): Promise<PerfilFamiliaVista[]> {
    const ahora = this.ahora();
    const propios = await this.perfiles.listarPorResponsable(cuentaId);
    const vinculados = (await this.perfiles.buscarPorIds(await this.vinculos.perfilesVinculadosA(cuentaId)))
      .filter((p) => !p.propsSnapshot.eliminadoEn)
      .sort((a, b) => a.alias.localeCompare(b.alias, 'es'));
    return [
      ...propios.map((p) => ({ ...vistaPerfil(p, ahora), relacion: 'RESPONSABLE' as const })),
      ...vinculados.map((p) => ({ ...vistaPerfil(p, ahora), relacion: 'VINCULADO' as const })),
    ];
  }
}
