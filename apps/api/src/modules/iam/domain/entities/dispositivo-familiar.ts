export const VIGENCIA_DISPOSITIVO_DIAS = 30;

export interface DispositivoFamiliarProps {
  id: string;
  cuentaId: string;
  nombre: string;
  /** Huella SHA-256 del token guardado en el dispositivo. */
  hashToken: string;
  creadoEn: Date;
  expiraEn: Date;
  revocadoEn: Date | null;
}

/**
 * Entidad: DispositivoFamiliar — contexto de ingreso del estudiante en casa (RF-007, RN-04).
 * Un adulto lo vincula una vez; durante 30 días los niños entran con avatar + PIN.
 */
export class DispositivoFamiliar {
  private constructor(private readonly props: DispositivoFamiliarProps) {}

  static vincular(params: {
    id: string;
    cuentaId: string;
    nombre: string;
    hashToken: string;
    ahora: Date;
  }): DispositivoFamiliar {
    return new DispositivoFamiliar({
      id: params.id,
      cuentaId: params.cuentaId,
      nombre: params.nombre.trim().slice(0, 40) || 'Dispositivo familiar',
      hashToken: params.hashToken,
      creadoEn: params.ahora,
      expiraEn: new Date(params.ahora.getTime() + VIGENCIA_DISPOSITIVO_DIAS * 86_400_000),
      revocadoEn: null,
    });
  }

  static desdePersistencia(props: DispositivoFamiliarProps): DispositivoFamiliar {
    return new DispositivoFamiliar(props);
  }

  get id(): string {
    return this.props.id;
  }

  get cuentaId(): string {
    return this.props.cuentaId;
  }

  get propsSnapshot(): Readonly<DispositivoFamiliarProps> {
    return this.props;
  }

  estaVigente(ahora: Date): boolean {
    return !this.props.revocadoEn && ahora.getTime() < this.props.expiraEn.getTime();
  }

  revocar(ahora: Date): void {
    this.props.revocadoEn = ahora;
  }
}
