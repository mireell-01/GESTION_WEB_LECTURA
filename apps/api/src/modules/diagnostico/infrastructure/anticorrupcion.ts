import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import { AulasDocente, IdentidadEstudiantes } from '../application/ports/diagnostico.ports';

/** Adaptador anticorrupción hacia IAM: alias, avatar y rango de edad del estudiante. */
export class IdentidadEstudiantesIam implements IdentidadEstudiantes {
  constructor(private readonly iam: IamFacade) {}

  async perfiles(ids: string[]) {
    return (await this.iam.resumenEstudiantes(ids)).map((e) => ({ id: e.id, alias: e.alias, avatar: e.avatar, rangoEdad: e.rangoEdad, activo: e.activo }));
  }
}

/** Adaptador anticorrupción hacia Escuela: solo el aula del docente y sus estudiantes (RN-17). */
export class AulasDocenteEscuela implements AulasDocente {
  constructor(private readonly escuela: EscuelaFacade) {}

  async aulaDelDocente(docenteId: string, aulaId: string) {
    const aula = await this.escuela.aula(aulaId).catch(() => null);
    return aula && aula.docenteId === docenteId ? { id: aula.id, nombre: aula.nombre, activa: aula.estado === 'ACTIVA' } : null;
  }

  estudiantes(aulaId: string): Promise<string[]> {
    return this.escuela.estudiantesDeAula(aulaId);
  }
}
