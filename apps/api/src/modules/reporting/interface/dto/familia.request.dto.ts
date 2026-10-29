import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

/** RF-070: recibir o no el resumen semanal por correo. */
export class PreferenciasFamiliaRequestDto {
  @IsBoolean()
  resumenSemanal!: boolean;
}

/**
 * RF-070: baja (o alta) con el enlace del correo. El token llega en el cuerpo desde la web o en la URL
 * desde el botón del programa de correo, que envía `List-Unsubscribe=One-Click` (RFC 8058).
 */
export class EnlaceBajaRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  token?: string;

  @IsOptional()
  @IsIn(['One-Click'])
  'List-Unsubscribe'?: string;
}

/** Solo desarrollo: correr los trabajos de reportes como si fuera otro momento. */
export class EjecutarTrabajosRequestDto {
  @IsOptional()
  @IsISO8601()
  ahora?: string;
}
