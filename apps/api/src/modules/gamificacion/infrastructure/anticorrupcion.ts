import { IamFacade } from '../../iam/public-api';
import { IdentidadEstudiantes } from '../application/ports/gamificacion.ports';

/** Anticorrupción hacia IAM: alias, avatar y rango de edad del estudiante activo. */
export class IdentidadEstudiantesIam implements IdentidadEstudiantes {
  constructor(private readonly iam: IamFacade) {}

  async perfil(estudianteId: string) {
    const [p] = await this.iam.resumenEstudiantes([estudianteId]).catch(() => []);
    return p?.activo ? { alias: p.alias, avatar: p.avatar, rangoEdad: p.rangoEdad } : null;
  }
}
