import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { RANGOS_EDAD } from '../../../shared-kernel/public-api';
import { MAX_LECTURAS_POR_MISION, MAX_MISIONES_POR_MUNDO } from '../../application/dto/contrato-aventura';

/** RF-032: datos de una misión. Las reglas de negocio las aplica el dominio (Mision). */
export class DatosMisionRequestDto {
  @IsString()
  @MaxLength(120)
  titulo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  descripcion?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LECTURAS_POR_MISION)
  @IsUUID('all', { each: true })
  lecturaIds!: string[];
}

export class CrearMisionRequestDto extends DatosMisionRequestDto {
  @IsIn(RANGOS_EDAD)
  rangoEdad!: string;
}

export class ReordenarMisionesRequestDto {
  @IsIn(RANGOS_EDAD)
  rangoEdad!: string;

  @IsArray()
  @ArrayMaxSize(MAX_MISIONES_POR_MUNDO)
  @IsUUID('all', { each: true })
  misionIds!: string[];
}

export class EdadQueryDto {
  @IsIn(RANGOS_EDAD)
  edad!: string;
}
