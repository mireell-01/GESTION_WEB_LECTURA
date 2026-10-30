import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { ATAJOS, Atajo, MAX_CARACTERES_MENSAJE } from '../../application/dto/asistente.dto';

/** RF-072: lo que el niño escribe al asistente, o un atajo para los que aún no escriben con soltura. */
export class TurnoRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CARACTERES_MENSAJE)
  mensaje?: string;

  @IsOptional()
  @IsIn(ATAJOS)
  atajo?: Atajo;
}

export class ActivacionRequestDto {
  @IsBoolean()
  activo!: boolean;
}

/** La docente: para algunos estudiantes de su aula o, sin indicarlos, para todos. */
export class ActivacionAulaRequestDto {
  @IsBoolean()
  activo!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(45)
  @IsUUID('all', { each: true })
  estudianteIds?: string[];
}
