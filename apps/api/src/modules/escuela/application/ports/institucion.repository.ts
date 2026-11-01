import { EstadoInstitucion, Institucion } from '../../domain/services/institucion';

/** Lo que tiene cada institución: aulas activas, sus docentes y sus estudiantes matriculados. */
export interface ConteoInstitucion {
  aulas: number;
  docentes: number;
  estudiantes: number;
}

/** Puerto de salida: instituciones educativas (schema `escuela`, RF-076). */
export interface InstitucionRepository {
  listar(): Promise<(Institucion & ConteoInstitucion)[]>;
  todas(): Promise<Institucion[]>;
  buscarPorId(id: string): Promise<Institucion | null>;
  crear(institucion: Institucion): Promise<void>;
  cambiarEstado(id: string, estado: EstadoInstitucion): Promise<void>;
  /** Vincula las aulas sin institución cuyo nombre escrito coincide (normalizado); devuelve cuántas. */
  vincularAulasPorNombre(institucionId: string, nombreNormalizado: string): Promise<number>;
  vincularAula(aulaId: string, institucionId: string): Promise<void>;
}
