/** Una versión guardada de los parámetros de gamificación (RF-078). */
export interface VersionParametros {
  version: number;
  vigenteDesde: Date;
  /** La administradora que la publicó; null en la versión 1 (sembrada por la migración). */
  creadoPor: string | null;
  creadoEn: Date;
  parametros: unknown;
}

/** Puerto de salida: el historial de versiones de `gamificacion.parametro_gamificacion`. */
export interface ParametrosRepository {
  /** De la más reciente a la más antigua. */
  versiones(): Promise<VersionParametros[]>;
  /** Guarda la versión siguiente, vigente desde `ahora`; devuelve su número. */
  publicar(p: { parametros: Record<string, unknown>; creadoPor: string; ahora: Date }): Promise<number>;
}
