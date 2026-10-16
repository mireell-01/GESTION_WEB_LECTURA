import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** DTO HTTP con validación (class-validator). La validación de negocio vive en el dominio. */

export class RegistrarCuentaRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nombre!: string;

  @IsEmail({}, { message: 'Escribe un correo electrónico válido' })
  email!: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  @MaxLength(128)
  contrasena!: string;

  @IsIn(['DOCENTE', 'FAMILIAR'], { message: 'Elige si eres docente o familiar' })
  rol!: 'DOCENTE' | 'FAMILIAR';
}

export class CodigoRequestDto {
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  codigo!: string;
}

export class AutenticarAdultoRequestDto {
  @IsEmail({}, { message: 'Escribe un correo electrónico válido' })
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  contrasena!: string;

  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'El código de verificación tiene 6 números' })
  codigoMfa?: string;
}

export class RecuperarContrasenaRequestDto {
  @IsEmail({}, { message: 'Escribe un correo electrónico válido' })
  email!: string;
}

export class RestablecerContrasenaRequestDto {
  @IsString()
  @MinLength(10)
  @MaxLength(200)
  codigo!: string;

  @IsString()
  @MinLength(10, { message: 'La contraseña debe tener al menos 10 caracteres' })
  @MaxLength(128)
  contrasenaNueva!: string;
}

export class CodigoMfaRequestDto {
  @Matches(/^\d{6}$/, { message: 'El código de verificación tiene 6 números' })
  codigo!: string;
}

export class ConsentimientoParentalRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  otorganteNombre!: string;

  @IsBoolean()
  @Equals(true, { message: 'Debes aceptar la política de privacidad para continuar' })
  aceptaPolitica!: boolean;
}

export class CrearPerfilRequestDto {
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

  @Matches(/^\d{4}$/, { message: 'El PIN tiene 4 números' })
  pin!: string;
}

export class ActualizarPerfilRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  alias?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class RestablecerPinRequestDto {
  @Matches(/^\d{4}$/, { message: 'El PIN tiene 4 números' })
  pinNuevo!: string;
}

export class VincularDispositivoRequestDto {
  @IsString()
  @MaxLength(40)
  nombre!: string;
}

/** RF-007 / CR-01: ingreso del estudiante desde una tablet activada (de la familia o del aula). */
export class IngresoEstudianteRequestDto {
  @IsString()
  perfilId!: string;

  @Matches(/^\d{4}$/, { message: 'El PIN tiene 4 números' })
  pin!: string;

  @IsString({ message: 'Esta tablet no está activada' })
  @MinLength(20, { message: 'Esta tablet no está activada' })
  tokenDispositivo!: string;
}
