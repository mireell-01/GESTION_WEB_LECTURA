export type EstadoMatricula = 'ACTIVA' | 'RETIRADA';

export interface MatriculaProps {
  id: string;
  aulaId: string;
  estudianteId: string;
  estado: EstadoMatricula;
  creadaEn: Date;
  retiradaEn: Date | null;
}

/** Entidad: Matricula — vincula un perfil de estudiante con un aula (RF-015). */
export class Matricula {
  private constructor(private readonly props: MatriculaProps) {}

  static crear(params: { id: string; aulaId: string; estudianteId: string; ahora: Date }): Matricula {
    return new Matricula({
      id: params.id,
      aulaId: params.aulaId,
      estudianteId: params.estudianteId,
      estado: 'ACTIVA',
      creadaEn: params.ahora,
      retiradaEn: null,
    });
  }

  static desdePersistencia(props: MatriculaProps): Matricula {
    return new Matricula(props);
  }

  get id(): string {
    return this.props.id;
  }

  get aulaId(): string {
    return this.props.aulaId;
  }

  get estudianteId(): string {
    return this.props.estudianteId;
  }

  get activa(): boolean {
    return this.props.estado === 'ACTIVA';
  }

  get propsSnapshot(): Readonly<MatriculaProps> {
    return this.props;
  }

  retirar(ahora: Date): void {
    if (this.activa) {
      this.props.estado = 'RETIRADA';
      this.props.retiradaEn = ahora;
    }
  }
}
