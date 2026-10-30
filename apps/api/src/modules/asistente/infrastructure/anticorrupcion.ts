import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import { esUuid } from '../../shared-kernel/public-api';
import { AccesoAdultos, IdentidadEstudiantes } from '../application/ports/asistente.ports';

/** Anticorrupción hacia IAM y Escuela: quién decide sobre el asistente de cada estudiante. */
export class AccesoAdultosIamEscuela implements AccesoAdultos {
  constructor(
    private readonly iam: IamFacade,
    private readonly escuela: EscuelaFacade,
  ) {}

  async esResponsable(cuentaId: string, estudianteId: string): Promise<boolean> {
    return (await this.iam.hijosDeFamilia(cuentaId)).some((h) => h.id === estudianteId && h.relacion === 'RESPONSABLE');
  }

  async aulaDeDocente(docenteId: string, aulaId: string): Promise<{ id: string; estudianteIds: string[] } | null> {
    if (!esUuid(aulaId)) return null;
    const aula = await this.escuela.aula(aulaId);
    if (!aula || aula.docenteId !== docenteId) return null;
    return { id: aula.id, estudianteIds: await this.escuela.estudiantesDeAula(aula.id) };
  }
}

/** Anticorrupción hacia IAM: alias y avatar. */
export class IdentidadEstudiantesIam implements IdentidadEstudiantes {
  constructor(private readonly iam: IamFacade) {}

  async perfiles(ids: string[]) {
    return (await this.iam.resumenEstudiantes(ids.filter(esUuid))).map((p) => ({ id: p.id, alias: p.alias, avatar: p.avatar }));
  }
}
