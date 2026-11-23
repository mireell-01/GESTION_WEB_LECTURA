import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { STICKERS } from '../../application/use-cases/mensajes-docente.use-case';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

export class CrearAulaRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  nombre!: string;

  @IsIn(['1', '2', '3', '4', '5', '6'], { message: 'El grado debe ser de 1.° a 6.° de primaria' })
  grado!: string;

  @IsInt()
  anioLectivo!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  institucion!: string;

  @IsString()
  @MinLength(3, { message: 'Escribe el nombre de la autoridad que firmó el consentimiento' })
  @MaxLength(120)
  autoridadConsentimiento!: string;

  @IsBoolean()
  @Equals(true, { message: 'Debes declarar que la institución cuenta con el consentimiento de las familias' })
  declaraConsentimiento!: boolean;
}

export class MatricularRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  alias!: string;

  @IsInt()
  anioNacimiento!: number;

  @IsInt()
  mesNacimiento!: number;

  @IsString()
  avatar!: string;
}

export class MatricularCsvRequestDto {
  @IsString()
  @MaxLength(20_000)
  csv!: string;
}

export class TarjetasRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(45)
  @IsString({ each: true })
  estudianteIds!: string[];
}

/** RF-018: lectura o misión con fecha límite (días de Lima, AAAA-MM-DD). */
export class CrearAsignacionRequestDto {
  @IsIn(['LECTURA', 'MISION'], { message: 'Elige si asignas una lectura o una misión' })
  tipo!: 'LECTURA' | 'MISION';

  @IsString()
  @MaxLength(64)
  contenidoId!: string;

  @IsOptional()
  @Matches(DIA, { message: 'Escribe la fecha de inicio como AAAA-MM-DD' })
  fechaInicio?: string;

  @Matches(DIA, { message: 'Escribe la fecha límite como AAAA-MM-DD' })
  fechaLimite!: string;

  /** Sin indicar o vacío: para toda el aula. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(45)
  @IsString({ each: true })
  estudianteIds?: string[];
}

/** RF-019: código de invitación que la docente entregó a la familia. */
export class CanjearInvitacionRequestDto {
  @IsString()
  @MaxLength(20)
  codigo!: string;
}

/** Mensajito de la docente: a un estudiante (o, sin él, a toda el aula), con sticker y texto corto. */
export class EnviarMensajeRequestDto {
  @IsOptional()
  @IsUUID('all', { message: 'Elige un estudiante del aula' })
  estudianteId?: string;

  @IsIn([...STICKERS], { message: 'Elige uno de los stickers' })
  sticker!: string;

  @IsString()
  @MaxLength(400)
  texto!: string;
}
