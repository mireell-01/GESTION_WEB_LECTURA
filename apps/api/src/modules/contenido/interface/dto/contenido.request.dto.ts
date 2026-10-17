import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { HABILIDADES, MAX_ACTIVIDADES, MAX_CARACTERES_TEXTO, MAX_NODOS, RANGOS_EDAD, TIPOS_TEXTO } from '../../application/dto/contrato-contenido';

/** RF-021: metadatos de la lectura. Las reglas de negocio las aplica el dominio (MetadatosLectura). */
export class MetadatosRequestDto {
  @IsString()
  @MaxLength(120)
  titulo!: string;

  @IsIn(RANGOS_EDAD)
  rangoEdad!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  nivelDificultad!: number;

  @IsString()
  @MaxLength(60)
  tematica!: string;

  @IsIn(TIPOS_TEXTO)
  tipoTexto!: string;

  @IsArray()
  @IsIn(HABILIDADES, { each: true })
  habilidadesObjetivo!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  licencia?: string | null;
}

export class CrearLecturaRequestDto {
  @ValidateNested()
  @Type(() => MetadatosRequestDto)
  metadatos!: MetadatosRequestDto;

  @IsString()
  @MaxLength(MAX_CARACTERES_TEXTO)
  texto!: string;
}

export class BorradorRequestDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => MetadatosRequestDto)
  metadatos?: MetadatosRequestDto;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CARACTERES_TEXTO)
  texto?: string;
}

export class DividirRequestDto {
  @IsInt()
  @Min(1)
  posicion!: number;
}

/**
 * RF-024, RF-025: la estructura de cada actividad la valida el dominio (construirActividades);
 * aquí solo se limita el tamaño de lo que llega.
 */
export class ActividadesRequestDto {
  @IsArray()
  @ArrayMaxSize(MAX_ACTIVIDADES)
  @IsObject({ each: true })
  actividades!: Record<string, unknown>[];
}

/** RF-029 */
export class GrafoRequestDto {
  @IsArray()
  @ArrayMaxSize(MAX_NODOS)
  @IsObject({ each: true })
  nodos!: Record<string, unknown>[];
}

/** RF-023: lo que se declara antes de subir el archivo. */
export class SolicitarSubidaRequestDto {
  @IsString()
  lecturaId!: string;

  @IsIn(['IMAGEN', 'AUDIO'])
  tipo!: string;

  @IsString()
  @MaxLength(40)
  tipoMime!: string;

  @IsInt()
  @Min(1)
  bytes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  textoAlternativo?: string;

  @IsOptional()
  @IsInt()
  duracionSeg?: number;
}

export class RechazarRequestDto {
  @IsString()
  @MaxLength(1000)
  comentario!: string;
}

/** RF-028: filtros de la biblioteca. */
export class BibliotecaQueryDto {
  @IsOptional()
  @IsIn(RANGOS_EDAD)
  edad?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  nivel?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tema?: string;

  @IsOptional()
  @IsIn(TIPOS_TEXTO)
  tipo?: string;

  @IsOptional()
  @IsIn(HABILIDADES)
  habilidad?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  cursor?: string;
}
