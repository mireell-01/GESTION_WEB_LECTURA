import type { RangoEdad } from '../../../shared-kernel/public-api';

/** Puerto anticorrupción hacia IAM: la biblioteca solo necesita el rango de edad del estudiante (RF-028). */
export interface IdentidadLectores {
  rangoEdad(estudianteId: string): Promise<RangoEdad | null>;
}
