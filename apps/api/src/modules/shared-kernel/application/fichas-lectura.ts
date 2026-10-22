import type { Habilidad } from '../domain/value-objects/habilidad';
import type { RangoEdad } from '../domain/value-objects/rango-edad';

/**
 * Puerto: FichasLectura — datos públicos de las lecturas publicadas (título, edad, nivel, temática).
 * Aventura arma misiones con ellas (RF-032) sin conocer Contenido: Contenido registra la fuente al
 * iniciar. Una lectura archivada o sin versión publicada no tiene ficha.
 */
export interface FichaLecturaPublicada {
  id: string;
  titulo: string;
  rangoEdad: RangoEdad;
  nivelDificultad: number;
  tematica: string;
  /** Las habilidades que trabaja (RN-20: recomendar para la habilidad más débil). */
  habilidadesObjetivo?: Habilidad[];
}

export interface FuenteFichasLectura {
  /** Fichas de las lecturas pedidas que siguen publicadas (en cualquier orden). */
  fichas(ids: string[]): Promise<FichaLecturaPublicada[]>;
  /** Todas las lecturas publicadas de un rango de edad, por título. */
  publicadas(rangoEdad: RangoEdad): Promise<FichaLecturaPublicada[]>;
}

export interface RegistroFichasLectura extends FuenteFichasLectura {
  registrar(fuente: FuenteFichasLectura): void;
}

export const FICHAS_LECTURA = Symbol('FICHAS_LECTURA');
