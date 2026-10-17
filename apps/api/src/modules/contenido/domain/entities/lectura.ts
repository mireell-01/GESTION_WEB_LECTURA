import { TransicionInvalidaError } from '../errors/errores-contenido';

export interface LecturaProps {
  id: string;
  autorId: string;
  versionPublicadaId: string | null;
  creadaEn: Date;
  archivadaEn: Date | null;
}

/**
 * Entidad: Lectura — identidad estable de un texto a lo largo de sus versiones (RF-027). Apunta a
 * la versión publicada vigente: la biblioteca y las asignaciones siempre ven esa.
 */
export class Lectura {
  private constructor(private readonly props: LecturaProps) {}

  static crear(params: { id: string; autorId: string; ahora: Date }): Lectura {
    return new Lectura({ id: params.id, autorId: params.autorId, versionPublicadaId: null, creadaEn: params.ahora, archivadaEn: null });
  }

  static desdePersistencia(props: LecturaProps): Lectura {
    return new Lectura(props);
  }

  get id(): string {
    return this.props.id;
  }

  get versionPublicadaId(): string | null {
    return this.props.versionPublicadaId;
  }

  get archivada(): boolean {
    return !!this.props.archivadaEn;
  }

  get propsSnapshot(): Readonly<LecturaProps> {
    return this.props;
  }

  /** Devuelve la versión que deja de estar publicada (para archivarla), si había una. */
  publicar(versionId: string): string | null {
    const anterior = this.props.versionPublicadaId;
    this.props.versionPublicadaId = versionId;
    this.props.archivadaEn = null;
    return anterior;
  }

  archivar(ahora: Date): void {
    if (this.props.archivadaEn) throw new TransicionInvalidaError('La lectura ya está archivada');
    this.props.archivadaEn = ahora;
    this.props.versionPublicadaId = null;
  }
}
