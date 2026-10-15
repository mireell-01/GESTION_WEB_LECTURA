/** Tipos de las respuestas de IAM que usa la web. */
export interface PerfilEstudiante {
  id: string;
  alias: string;
  avatar: string;
  anioNacimiento: number;
  mesNacimiento: number;
  rangoEdad: 'R1' | 'R2' | 'R3';
  activo: boolean;
  bloqueadoHasta: string | null;
  creadoEn: string;
}

export const NOMBRE_RANGO: Record<PerfilEstudiante['rangoEdad'], string> = {
  R1: '6–7 años',
  R2: '8–9 años',
  R3: '10–12 años',
};

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
