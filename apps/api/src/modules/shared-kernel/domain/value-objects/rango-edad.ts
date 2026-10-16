/**
 * Value Object: RangoEdad (SRS §2.2) — R1: 6–7 años · R2: 8–9 años · R3: 10–12 años.
 * Se deriva del año y mes de nacimiento; las edades límite admitidas (5 y 13) se agrupan en R1 y R3.
 */
export type RangoEdad = 'R1' | 'R2' | 'R3';

export const RANGOS_EDAD: readonly RangoEdad[] = ['R1', 'R2', 'R3'];

export function edadEnAnios(anioNacimiento: number, mesNacimiento: number, ahora: Date): number {
  let edad = ahora.getFullYear() - anioNacimiento;
  if (ahora.getMonth() + 1 < mesNacimiento) edad -= 1;
  return edad;
}

export function rangoEdadDe(edad: number): RangoEdad {
  if (edad <= 7) return 'R1';
  if (edad <= 9) return 'R2';
  return 'R3';
}

export function rangoEdadPorNacimiento(anio: number, mes: number, ahora: Date): RangoEdad {
  return rangoEdadDe(edadEnAnios(anio, mes, ahora));
}

/** RF-028: el estudiante ve lecturas de su rango ± 1 nivel. */
export function rangosVecinos(rango: RangoEdad): RangoEdad[] {
  const i = RANGOS_EDAD.indexOf(rango);
  return RANGOS_EDAD.filter((_, j) => Math.abs(i - j) <= 1);
}
