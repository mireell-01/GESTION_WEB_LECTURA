import { IamFacade } from '../../../iam/public-api';
import { RangoEdad } from '../../../shared-kernel/public-api';
import { IdentidadEstudiantes } from '../../application/ports/identidad-estudiantes';

/** Adaptador anticorrupción: de IAM, Aventura solo necesita el rango de edad del niño. */
export class IdentidadEstudiantesIam implements IdentidadEstudiantes {
  constructor(private readonly iam: IamFacade) {}

  async rangoEdad(estudianteId: string): Promise<RangoEdad | null> {
    const [estudiante] = await this.iam.resumenEstudiantes([estudianteId]);
    return estudiante?.activo ? estudiante.rangoEdad : null;
  }
}
