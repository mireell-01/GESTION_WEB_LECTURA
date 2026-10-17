import { DatoAsignacionInvalidoError } from '../errors/errores-escuela';
import { FechaLima } from '../value-objects/fecha-lima';

export type TipoAsignacion = 'LECTURA' | 'MISION';
export type EstadoAsignacion = 'PROGRAMADA' | 'ACTIVA' | 'VENCIDA' | 'CERRADA';

/** La fecha límite puede estar hasta 6 meses adelante (dentro del año escolar). */
export const MAX_DIAS_ASIGNACION = 183;

export interface AsignacionProps {
  id: string;
  aulaId: string;
  docenteId: string;
  tipo: TipoAsignacion;
  /** Id de la lectura (Contenido) o de la misión (Aventura): referencia entre contextos, sin FK. */
  contenidoId: string;
  titulo: string;
  /** Vacío = para toda el aula. */
  estudianteIds: string[];
  fechaInicio: Date;
  fechaLimite: Date;
  estado: EstadoAsignacion;
  creadaEn: Date;
}

/**
 * Agregado: Asignacion (RF-018) — una lectura o misión que la docente deja a su aula o a
 * estudiantes elegidos, con fecha límite. Estados: PROGRAMADA → ACTIVA → VENCIDA por el paso del
 * tiempo (hora de Lima) y CERRADA cuando la docente la cierra o archiva el aula.
 */
export class Asignacion {
  private constructor(private readonly props: AsignacionProps) {}

  static crear(params: {
    id: string;
    aulaId: string;
    docenteId: string;
    tipo: TipoAsignacion;
    contenidoId: string;
    titulo: string;
    estudianteIds: string[];
    desde: FechaLima;
    hasta: FechaLima;
    ahora: Date;
  }): Asignacion {
    const hoy = FechaLima.hoy(params.ahora);
    if (params.desde.esAnteriorA(hoy)) {
      throw new DatoAsignacionInvalidoError('La fecha de inicio no puede ser anterior a hoy');
    }
    if (params.hasta.esAnteriorA(params.desde)) {
      throw new DatoAsignacionInvalidoError('La fecha límite debe ser igual o posterior a la fecha de inicio');
    }
    if (hoy.sumarDias(MAX_DIAS_ASIGNACION).esAnteriorA(params.hasta)) {
      throw new DatoAsignacionInvalidoError('La fecha límite puede ser hasta dentro de 6 meses');
    }
    const titulo = params.titulo.trim();
    if (titulo.length === 0 || titulo.length > 200) {
      throw new DatoAsignacionInvalidoError('La asignación necesita el título de su lectura o misión');
    }

    const asignacion = new Asignacion({
      id: params.id,
      aulaId: params.aulaId,
      docenteId: params.docenteId,
      tipo: params.tipo,
      contenidoId: params.contenidoId,
      titulo,
      estudianteIds: [...new Set(params.estudianteIds)],
      fechaInicio: params.desde.inicio,
      fechaLimite: params.hasta.fin,
      estado: 'PROGRAMADA',
      creadaEn: params.ahora,
    });
    asignacion.actualizarEstado(params.ahora);
    return asignacion;
  }

  static desdePersistencia(props: AsignacionProps): Asignacion {
    return new Asignacion({ ...props, estudianteIds: [...props.estudianteIds] });
  }

  get id(): string {
    return this.props.id;
  }

  get aulaId(): string {
    return this.props.aulaId;
  }

  get contenidoId(): string {
    return this.props.contenidoId;
  }

  get paraTodaElAula(): boolean {
    return this.props.estudianteIds.length === 0;
  }

  get estudianteIds(): readonly string[] {
    return this.props.estudianteIds;
  }

  /** Estado guardado: puede ir un paso detrás del tiempo hasta que se actualiza. */
  get estado(): EstadoAsignacion {
    return this.props.estado;
  }

  get propsSnapshot(): Readonly<AsignacionProps> {
    return this.props;
  }

  /** Estado vigente en un instante: el cierre manda; si no, lo deciden las fechas. */
  estadoEn(ahora: Date): EstadoAsignacion {
    if (this.props.estado === 'CERRADA') return 'CERRADA';
    if (ahora < this.props.fechaInicio) return 'PROGRAMADA';
    if (ahora <= this.props.fechaLimite) return 'ACTIVA';
    return 'VENCIDA';
  }

  /** Lleva el estado guardado al vigente; true si cambió (hay que guardarlo). */
  actualizarEstado(ahora: Date): boolean {
    const vigente = this.estadoEn(ahora);
    if (vigente === this.props.estado) return false;
    this.props.estado = vigente;
    return true;
  }

  /** Programada o en curso: todavía está pendiente para el aula. */
  estaAbierta(ahora: Date): boolean {
    const estado = this.estadoEn(ahora);
    return estado === 'PROGRAMADA' || estado === 'ACTIVA';
  }

  esPara(estudianteId: string): boolean {
    return this.paraTodaElAula || this.props.estudianteIds.includes(estudianteId);
  }

  /** La docente la da por terminada. Cerrar dos veces no cambia nada. */
  cerrar(): void {
    this.props.estado = 'CERRADA';
  }
}
