export const VIGENCIA_DISPOSITIVO_DIAS = 30;

/** Para quién quedó activado el dispositivo: la familia de la cuenta o un aula de la docente. */
export type ContextoDispositivo = { tipo: 'FAMILIA' } | { tipo: 'AULA'; aulaId: string };

export interface DispositivoIngresoProps {
  id: string;
  /** Adulto que lo activó: familiar (FAMILIA) o docente del aula (AULA). */
  cuentaId: string;
  aulaId: string | null;
  nombre: string;
  /** Huella SHA-256 del token guardado en el dispositivo. */
  hashToken: string;
  creadoEn: Date;
  expiraEn: Date;
  revocadoEn: Date | null;
}

/**
 * Entidad: DispositivoIngreso — contexto de ingreso del estudiante (RF-007, RN-04, CR-01).
 * Un adulto activa la tablet una vez; durante 30 días los niños de su familia o de su aula
 * entran solo con avatar + PIN, sin escribir ningún código.
 */
export class DispositivoIngreso {
  private constructor(private readonly props: DispositivoIngresoProps) {}

  static activar(params: {
    id: string;
    cuentaId: string;
    contexto: ContextoDispositivo;
    nombre: string;
    hashToken: string;
    ahora: Date;
  }): DispositivoIngreso {
    const porDefecto = params.contexto.tipo === 'AULA' ? 'Tablet del aula' : 'Dispositivo familiar';
    return new DispositivoIngreso({
      id: params.id,
      cuentaId: params.cuentaId,
      aulaId: params.contexto.tipo === 'AULA' ? params.contexto.aulaId : null,
      nombre: params.nombre.trim().slice(0, 40) || porDefecto,
      hashToken: params.hashToken,
      creadoEn: params.ahora,
      expiraEn: new Date(params.ahora.getTime() + VIGENCIA_DISPOSITIVO_DIAS * 86_400_000),
      revocadoEn: null,
    });
  }

  static desdePersistencia(props: DispositivoIngresoProps): DispositivoIngreso {
    return new DispositivoIngreso(props);
  }

  get id(): string {
    return this.props.id;
  }

  get cuentaId(): string {
    return this.props.cuentaId;
  }

  get contexto(): ContextoDispositivo {
    return this.props.aulaId ? { tipo: 'AULA', aulaId: this.props.aulaId } : { tipo: 'FAMILIA' };
  }

  get propsSnapshot(): Readonly<DispositivoIngresoProps> {
    return this.props;
  }

  estaVigente(ahora: Date): boolean {
    return !this.props.revocadoEn && ahora.getTime() < this.props.expiraEn.getTime();
  }

  revocar(ahora: Date): void {
    this.props.revocadoEn = ahora;
  }
}
