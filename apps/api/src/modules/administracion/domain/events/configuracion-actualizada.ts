/**
 * Domain Event: ConfiguracionActualizada — capa de dominio.
 */
export interface ConfiguracionActualizadaProps {
  // TODO: payload del evento
}

export class ConfiguracionActualizada {
  readonly nombreEvento = 'ConfiguracionActualizada';
  readonly ocurreEn: Date = new Date();

  constructor(readonly agregadoId: string, readonly props: ConfiguracionActualizadaProps) {}
}
