import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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
