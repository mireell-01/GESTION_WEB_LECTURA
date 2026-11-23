import { NoEncontradoError } from '../../../shared-kernel/public-api';
import { Apariencia, ponerse, quitarse } from '../../domain/services/apariencia';
import { AparienciaVista, Puestas } from '../dto/gamificacion.dto';
import { GamificacionRepository, IdentidadEstudiantes, RecompensaCatalogo } from '../ports/gamificacion.ports';

/** Los códigos de lo que tiene puesto (una recompensa retirada del catálogo ya no se muestra). */
export function puestasDe(a: Apariencia, catalogo: RecompensaCatalogo[]): Puestas {
  const codigo = (id: string | null) => (id ? (catalogo.find((r) => r.id === id)?.codigo ?? null) : null);
  return { accesorio: codigo(a.accesorioId), personaje: codigo(a.personajeId) };
}

/**
 * RF-062 (ampliado): las recompensas se usan. El niño se pone el accesorio que canjeó (lo luce en su
 * avatar, en el inicio, el pasaporte y la Copa Lectora) y elige el personaje que lo acompaña al leer.
 */
export class AparienciaUseCase {
  constructor(
    private readonly repo: GamificacionRepository,
    private readonly identidad: IdentidadEstudiantes,
  ) {}

  async ver(estudianteId: string): Promise<AparienciaVista> {
    const perfil = await this.identidad.perfil(estudianteId);
    if (!perfil) throw new NoEncontradoError('Estudiante');
    const [apariencia, catalogo] = await Promise.all([this.repo.apariencia(estudianteId), this.repo.recompensas()]);
    return { avatar: perfil.avatar, ...puestasDe(apariencia, catalogo) };
  }

  /** Se pone un personaje o accesorio que ya es suyo, en lugar del que tenía de ese tipo. */
  async ponerse(estudianteId: string, recompensaId: string): Promise<AparienciaVista> {
    const recompensa = await this.recompensa(recompensaId);
    await this.repo.cambiarApariencia(estudianteId, (actual, canjeadas) => ponerse(actual, recompensa, canjeadas.has(recompensa.id)));
    return this.ver(estudianteId);
  }

  async quitarse(estudianteId: string, recompensaId: string): Promise<AparienciaVista> {
    const recompensa = await this.recompensa(recompensaId);
    await this.repo.cambiarApariencia(estudianteId, (actual) => quitarse(actual, recompensa.id));
    return this.ver(estudianteId);
  }

  private async recompensa(id: string): Promise<RecompensaCatalogo> {
    const recompensa = (await this.repo.recompensas()).find((r) => r.id === id);
    if (!recompensa) throw new NoEncontradoError('Recompensa');
    return recompensa;
  }
}
