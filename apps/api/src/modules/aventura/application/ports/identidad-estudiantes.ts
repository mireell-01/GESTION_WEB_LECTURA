import { RangoEdad } from '../../../shared-kernel/public-api';

/** Puerto anticorrupción hacia IAM: el rango de edad decide qué misiones ve el estudiante. */
export interface IdentidadEstudiantes {
  /** null si el perfil no existe o está desactivado. */
  rangoEdad(estudianteId: string): Promise<RangoEdad | null>;
}
