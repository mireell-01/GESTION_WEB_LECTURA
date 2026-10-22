import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

/**
 * Forma de las peticiones de Lectura. Los textos admiten un poco más de lo permitido: el dominio
 * explica el límite con un mensaje para el niño (RF-041: hasta 500 caracteres).
 */

/** RF-038: abrir (o reanudar) una lectura; con la asignación de su docente, si viene de ella (RF-018). */
export class IniciarSesionRequestDto {
  @IsUUID('all')
  lecturaId!: string;

  @IsOptional()
  @IsUUID('all')
  asignacionId?: string;
}

/** RF-038: la predicción escrita, o la opción elegida. */
export class PrediccionRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(600)
  texto?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  indice?: number;
}

/** RF-040 a RF-044, RF-049: la respuesta a la pregunta en pantalla, con su clave de idempotencia (RF-046). */
export class RespuestaRequestDto {
  @IsUUID('all')
  itemId!: string;

  @IsUUID('all')
  idempotencyKey!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  indice?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsInt({ each: true })
  indices?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsInt({ each: true })
  orden?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(400)
  @IsUUID('all', { each: true })
  oraciones?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(600)
  texto?: string;

  /** RF-049: el texto llegó dictado (el audio nunca se envía). */
  @IsOptional()
  @IsBoolean()
  porVoz?: boolean;
}

/** RF-048: el camino elegido en el nodo actual de la historia. */
export class DecisionRequestDto {
  @IsUUID('all')
  nodoId!: string;

  @IsInt()
  @Min(0)
  @Max(2)
  opcion!: number;
}

/** RF-047: la reflexión del cierre. */
export class FinalizarRequestDto {
  @IsString()
  @MaxLength(600)
  reflexion!: string;
}

/** RF-051: qué respuestas abiertas ver. */
export class RespuestasAbiertasQueryDto {
  @IsOptional()
  @IsIn(['PENDIENTE_REVISION', 'VALORADA'])
  estado?: 'PENDIENTE_REVISION' | 'VALORADA';
}

/** RF-051: la rúbrica de 3 niveles y un comentario opcional. */
export class ValoracionRequestDto {
  @IsInt()
  @Min(1)
  @Max(3)
  nivel!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  comentario?: string;
}
