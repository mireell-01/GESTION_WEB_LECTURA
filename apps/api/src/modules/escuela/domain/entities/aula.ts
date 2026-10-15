import { AulaArchivadaError, DatoAulaInvalidoError } from '../errors/errores-escuela';
import { CodigoAula } from '../value-objects/codigo-aula';

export const MAX_MATRICULAS_ACTIVAS = 45;

/** Primaria peruana: 1.° a 6.° grado (niñas y niños de 6 a 12 años). */
export const GRADOS = ['1', '2', '3', '4', '5', '6'] as const;
export type Grado = (typeof GRADOS)[number];

export type EstadoAula = 'ACTIVA' | 'ARCHIVADA';

export interface AulaProps {
  id: string;
  docenteId: string;
  nombre: string;
  grado: Grado;
  anioLectivo: number;
  institucion: string;
  codigo: CodigoAula;
  estado: EstadoAula;
  creadaEn: Date;
  archivadaEn: Date | null;
}

/**
 * Agregado: Aula — grupo de estudiantes de un docente en un año lectivo (RF-014).
 * Estados: ACTIVA → ARCHIVADA (RF-020, solo lectura).
 */
export class Aula {
  private constructor(private readonly props: AulaProps) {}

  static crear(params: {
    id: string;
    docenteId: string;
    nombre: string;
    grado: string;
    anioLectivo: number;
    institucion: string;
    codigo: CodigoAula;
    ahora: Date;
  }): Aula {
    const nombre = params.nombre.trim();
    if (nombre.length < 2 || nombre.length > 60) {
      throw new DatoAulaInvalidoError('El nombre del aula debe tener entre 2 y 60 caracteres');
    }
    if (!(GRADOS as readonly string[]).includes(params.grado)) {
      throw new DatoAulaInvalidoError('El grado debe ser de 1.° a 6.° de primaria');
    }
    const anioActual = params.ahora.getFullYear();
    if (!Number.isInteger(params.anioLectivo) || Math.abs(params.anioLectivo - anioActual) > 1) {
      throw new DatoAulaInvalidoError(`El año lectivo debe ser ${anioActual - 1}, ${anioActual} o ${anioActual + 1}`);
    }
    const institucion = params.institucion.trim();
    if (institucion.length < 3 || institucion.length > 120) {
      throw new DatoAulaInvalidoError('Escribe el nombre de la institución educativa');
    }
    return new Aula({
      id: params.id,
      docenteId: params.docenteId,
      nombre,
      grado: params.grado as Grado,
      anioLectivo: params.anioLectivo,
      institucion,
      codigo: params.codigo,
      estado: 'ACTIVA',
      creadaEn: params.ahora,
      archivadaEn: null,
    });
  }

  static desdePersistencia(props: AulaProps): Aula {
    return new Aula(props);
  }

  get id(): string {
    return this.props.id;
  }

  get docenteId(): string {
    return this.props.docenteId;
  }

  get nombre(): string {
    return this.props.nombre;
  }

  get codigo(): CodigoAula {
    return this.props.codigo;
  }

  get estaActiva(): boolean {
    return this.props.estado === 'ACTIVA';
  }

  get propsSnapshot(): Readonly<AulaProps> {
    return this.props;
  }

  perteneceA(docenteId: string): boolean {
    return this.props.docenteId === docenteId;
  }

  asegurarEditable(): void {
    if (!this.estaActiva) throw new AulaArchivadaError();
  }

  /** RF-020: al cierre del año lectivo; los estudiantes conservan su perfil lector. */
  archivar(ahora: Date): void {
    this.asegurarEditable();
    this.props.estado = 'ARCHIVADA';
    this.props.archivadaEn = ahora;
  }
}
