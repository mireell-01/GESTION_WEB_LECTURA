import { NoEncontradoError } from '../../../shared-kernel/public-api';
import { ActivacionAula, ActivacionEstudiante } from '../dto/asistente.dto';
import { AccesoAdultos, ActivacionRepository, IdentidadEstudiantes } from '../ports/asistente.ports';

/**
 * RF-072: el asistente se activa por estudiante. Lo deciden la familia que creó su perfil (su
 * consentimiento, ADR-008) o su docente para su aula (consentimiento institucional, RF-015). Gana el
 * último cambio, y queda registrado quién lo hizo. Para cualquier otro estudiante responde 404 (RN-17).
 */
export class ActivacionUseCase {
  constructor(
    private readonly repo: ActivacionRepository,
    private readonly acceso: AccesoAdultos,
    private readonly identidad: IdentidadEstudiantes,
    private readonly ahora: () => Date,
  ) {}

  async deFamilia(cuentaId: string, estudianteId: string): Promise<ActivacionEstudiante> {
    if (!(await this.acceso.esResponsable(cuentaId, estudianteId))) throw new NoEncontradoError('Estudiante');
    return { estudianteId, activo: await this.repo.activo(estudianteId) };
  }

  async cambiarFamilia(cuentaId: string, estudianteId: string, activo: boolean): Promise<ActivacionEstudiante> {
    if (!(await this.acceso.esResponsable(cuentaId, estudianteId))) throw new NoEncontradoError('Estudiante');
    await this.repo.guardar({ estudianteIds: [estudianteId], activo, cambiadoPor: cuentaId, rol: 'FAMILIAR', ahora: this.ahora() });
    return { estudianteId, activo };
  }

  async deAula(docenteId: string, aulaId: string): Promise<ActivacionAula> {
    const aula = await this.acceso.aulaDeDocente(docenteId, aulaId);
    if (!aula) throw new NoEncontradoError('Aula');
    const [estados, perfiles] = await Promise.all([this.repo.estados(aula.estudianteIds), this.identidad.perfiles(aula.estudianteIds)]);
    return {
      aulaId: aula.id,
      estudiantes: perfiles
        .map((p) => ({ estudianteId: p.id, alias: p.alias, avatar: p.avatar, activo: estados.get(p.id) ?? false }))
        .sort((a, b) => a.alias.localeCompare(b.alias, 'es')),
    };
  }

  /** Para algunos estudiantes del aula o, sin indicar, para todos. */
  async cambiarAula(docenteId: string, aulaId: string, estudianteIds: string[] | undefined, activo: boolean): Promise<ActivacionAula> {
    const aula = await this.acceso.aulaDeDocente(docenteId, aulaId);
    if (!aula) throw new NoEncontradoError('Aula');
    const ids = estudianteIds ?? aula.estudianteIds;
    if (ids.some((id) => !aula.estudianteIds.includes(id))) throw new NoEncontradoError('Estudiante');
    if (ids.length > 0) await this.repo.guardar({ estudianteIds: ids, activo, cambiadoPor: docenteId, rol: 'DOCENTE', ahora: this.ahora() });
    return this.deAula(docenteId, aulaId);
  }
}
