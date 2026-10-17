import { DatoLecturaInvalidoError } from '../errors/errores-contenido';

/** SRS §5, value objects del dominio. */
export const RANGOS_EDAD = ['R1', 'R2', 'R3'] as const;
export const HABILIDADES = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'] as const;
export const TIPOS_TEXTO = [
  'CUENTO', 'HISTORIETA', 'POEMA', 'NOTICIA_INFANTIL', 'CIENTIFICO', 'INFORMATIVO', 'ANUNCIO', 'INSTRUCTIVO', 'COTIDIANO',
] as const;

export type RangoEdadLectura = (typeof RANGOS_EDAD)[number];
export type Habilidad = (typeof HABILIDADES)[number];
export type TipoTexto = (typeof TIPOS_TEXTO)[number];

export interface DatosMetadatos {
  titulo: string;
  rangoEdad: string;
  nivelDificultad: number;
  tematica: string;
  tipoTexto: string;
  habilidadesObjetivo: string[];
  licencia?: string | null;
}

/**
 * Value Object: MetadatosLectura (RF-021). Un borrador puede guardarse sin licencia ni
 * habilidades; sin ellas no puede enviarse a revisión (lo decide la versión).
 */
export class MetadatosLectura {
  private constructor(
    readonly titulo: string,
    readonly rangoEdad: RangoEdadLectura,
    readonly nivelDificultad: number,
    readonly tematica: string,
    readonly tipoTexto: TipoTexto,
    readonly habilidadesObjetivo: Habilidad[],
    readonly licencia: string | null,
  ) {}

  static de(d: DatosMetadatos): MetadatosLectura {
    const titulo = d.titulo.trim();
    if (titulo.length < 3 || titulo.length > 120) throw new DatoLecturaInvalidoError('El título debe tener entre 3 y 120 caracteres');
    if (!(RANGOS_EDAD as readonly string[]).includes(d.rangoEdad)) throw new DatoLecturaInvalidoError('Elige el rango de edad: 6–7, 8–9 o 10–12 años');
    if (!Number.isInteger(d.nivelDificultad) || d.nivelDificultad < 1 || d.nivelDificultad > 5) {
      throw new DatoLecturaInvalidoError('El nivel de dificultad va de 1 a 5');
    }
    const tematica = d.tematica.trim();
    if (tematica.length < 2 || tematica.length > 60) throw new DatoLecturaInvalidoError('Escribe la temática (2 a 60 caracteres)');
    if (!(TIPOS_TEXTO as readonly string[]).includes(d.tipoTexto)) throw new DatoLecturaInvalidoError('Elige un tipo de texto válido');
    const habilidades = [...new Set(d.habilidadesObjetivo)];
    if (habilidades.some((h) => !(HABILIDADES as readonly string[]).includes(h))) {
      throw new DatoLecturaInvalidoError('Las habilidades son LIT, INF, VOC, CRI y ARG');
    }
    const licencia = d.licencia?.trim() || null;
    if (licencia && licencia.length > 120) throw new DatoLecturaInvalidoError('La licencia admite hasta 120 caracteres');
    return new MetadatosLectura(
      titulo,
      d.rangoEdad as RangoEdadLectura,
      d.nivelDificultad,
      tematica,
      d.tipoTexto as TipoTexto,
      habilidades as Habilidad[],
      licencia,
    );
  }

  get datos(): DatosMetadatos {
    return {
      titulo: this.titulo,
      rangoEdad: this.rangoEdad,
      nivelDificultad: this.nivelDificultad,
      tematica: this.tematica,
      tipoTexto: this.tipoTexto,
      habilidadesObjetivo: [...this.habilidadesObjetivo],
      licencia: this.licencia,
    };
  }
}
