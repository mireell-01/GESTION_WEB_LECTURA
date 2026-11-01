import { IsEmail, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** RF-076: alta de una institución educativa. */
export class CrearInstitucionRequestDto {
  @IsString()
  @MaxLength(120)
  nombre!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/, { message: 'El código modular tiene 7 dígitos' })
  codigoModular?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  region?: string;
}

export class EstadoInstitucionRequestDto {
  @IsIn(['ACTIVA', 'SUSPENDIDA'])
  estado!: 'ACTIVA' | 'SUSPENDIDA';
}

/** RF-076: alta de un docente (crea su contraseña con el enlace que recibe por correo). */
export class AltaDocenteRequestDto {
  @IsString()
  @MaxLength(120)
  nombre!: string;

  @IsEmail({}, { message: 'Escribe un correo válido' })
  @MaxLength(254)
  email!: string;
}

export class FiltroDocentesRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  texto?: string;

  @IsOptional()
  @IsIn(['PENDIENTE_VERIFICACION', 'ACTIVA', 'SUSPENDIDA'])
  estado?: 'PENDIENTE_VERIFICACION' | 'ACTIVA' | 'SUSPENDIDA';
}

/** RF-077: filtros de la consulta de auditoría (fechas en ISO o AAAA-MM-DD, hora de Lima). */
export class ConsultaAuditoriaRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  desde?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  hasta?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  accion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  actorId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  recursoTipo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  recursoId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  antesDe?: string;
}

/** RF-078: una versión completa de los parámetros (el dominio de Gamificación valida cada valor). */
export class ParametrosGamificacionRequestDto {
  @IsObject()
  puntos!: Record<string, unknown>;

  @IsObject()
  antiFarming!: Record<string, unknown>;

  @IsObject()
  nivelLector!: Record<string, unknown>;

  @IsObject()
  respuestasAbiertas!: Record<string, unknown>;

  @IsObject()
  insignias!: Record<string, unknown>;
}
