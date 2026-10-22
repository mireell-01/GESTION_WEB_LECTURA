import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** RF-034: la opción elegida para la pregunta en pantalla. */
export class ResponderRequestDto {
  @IsUUID('all')
  itemId!: string;

  @IsInt()
  @Min(0)
  @Max(4)
  indice!: number;
}

/** RF-037: a quiénes reevaluar (sin lista, a toda el aula). */
export class AsignarReevaluacionRequestDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(45)
  @IsUUID('all', { each: true })
  estudianteIds?: string[];
}
