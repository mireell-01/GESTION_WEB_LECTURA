/** Cuántas aulas activas y estudiantes matriculados tiene un docente (RF-076, vista de la administración). */
export interface AulasDeDocente {
  aulas: number;
  estudiantes: number;
}

/** Puerto de salida: resumen de aulas por docente (consulta agregada, solo lectura). */
export interface ResumenAulasRepository {
  porDocentes(docenteIds: string[]): Promise<Map<string, AulasDeDocente>>;
}
