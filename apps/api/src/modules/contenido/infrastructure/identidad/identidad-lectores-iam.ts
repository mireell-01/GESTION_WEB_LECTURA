import { IamFacade } from '../../../iam/public-api';
import { RangoEdad } from '../../../shared-kernel/public-api';
import { IdentidadLectores } from '../../application/ports/identidad-lectores';

/** Adaptador anticorrupción: lo único que la biblioteca necesita de IAM es el rango de edad del niño. */
export class IdentidadLectoresIam implements IdentidadLectores {
  constructor(private readonly iam: IamFacade) {}

  async rangoEdad(estudianteId: string): Promise<RangoEdad | null> {
    const [estudiante] = await this.iam.resumenEstudiantes([estudianteId]);
    return estudiante?.activo ? estudiante.rangoEdad : null;
  }
}
