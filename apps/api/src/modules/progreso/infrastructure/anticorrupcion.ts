import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import { RangoEdad } from '../../shared-kernel/public-api';
import { AsignacionesEstudiante, IdentidadEstudiantes } from '../application/ports/progreso.ports';

/** Anticorrupción hacia IAM: el rango de edad del estudiante. */
export class IdentidadEstudiantesIam implements IdentidadEstudiantes {
  constructor(private readonly iam: IamFacade) {}

  async rangoDe(estudianteId: string): Promise<RangoEdad | null> {
    const [perfil] = await this.iam.resumenEstudiantes([estudianteId]).catch(() => []);
    return perfil?.activo ? perfil.rangoEdad : null;
  }
}

/** Anticorrupción hacia Escuela: las asignaciones en curso, de la más próxima a vencer a la más lejana. */
export class AsignacionesEscuela implements AsignacionesEstudiante {
  constructor(private readonly escuela: EscuelaFacade) {}

  async vigentes(estudianteId: string) {
    const misiones = await this.escuela.misionesDelDocente(estudianteId);
    return [...misiones]
      .sort((a, b) => a.fechaLimite.localeCompare(b.fechaLimite))
      .map((m) => ({
        asignacionId: m.id,
        tipo: m.tipo,
        contenidoId: m.contenidoId,
        titulo: m.titulo,
      }));
  }
}
