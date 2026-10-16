import { PerfilEstudianteVista, Reloj } from '../dto/iam.dto';
import { PerfilEstudianteRepository } from '../ports/perfil-estudiante.repository';
import { vistaPerfil } from '../services/perfiles';

/** Use Case: ListarPerfiles (RF-068, RF-071) — perfiles de los que la cuenta es responsable. */
export class ListarPerfilesUseCase {
  constructor(
    private readonly perfiles: PerfilEstudianteRepository,
    private readonly ahora: Reloj,
  ) {}

  async ejecutar(cuentaResponsableId: string): Promise<PerfilEstudianteVista[]> {
    const ahora = this.ahora();
    const lista = await this.perfiles.listarPorResponsable(cuentaResponsableId);
    return lista.map((p) => vistaPerfil(p, ahora));
  }
}
