import { RangoEdad } from '../../../shared-kernel/public-api';
import { Asignacion, EstadoAsignacion, TipoAsignacion } from '../../domain/entities/asignacion';
import { Aula } from '../../domain/entities/aula';
import { FechaLima } from '../../domain/value-objects/fecha-lima';

export type Reloj = () => Date;
export type GeneradorId = () => string;
/** Entero uniforme en [0, n) de una fuente criptográfica. */
export type Aleatorio = (n: number) => number;
/** Huella irreversible (SHA-256) de un código de un solo uso: en la base nunca queda el código. */
export type Huella = (texto: string) => string;

export interface AulaVista {
  id: string;
  nombre: string;
  grado: string;
  anioLectivo: number;
  institucion: string;
  codigo: string;
  estado: 'ACTIVA' | 'ARCHIVADA';
  totalEstudiantes: number;
  creadaEn: string;
}

export interface EstudianteAulaVista {
  id: string;
  alias: string;
  avatar: string;
  rangoEdad: RangoEdad;
  activo: boolean;
  bloqueado: boolean;
  /** RF-019: familiares que ya lo acompañan desde casa (máximo 2). */
  familiaresVinculados: number;
  matriculadoEn: string;
}

/** Estudiante recién matriculado (RF-015, RF-016). Su PIN solo aparecerá en la tarjeta impresa. */
export interface EstudianteMatriculado {
  estudianteId: string;
  alias: string;
  avatar: string;
}

/** Datos de una tarjeta de acceso (RF-017, CR-01): sin código de aula; el PIN solo existe aquí. */
export interface TarjetaAcceso {
  estudianteId: string;
  alias: string;
  avatar: string;
  nombreAula: string;
  pin: string;
}

export interface EstudianteResumido {
  id: string;
  alias: string;
  avatar: string;
}

/** Asignación vista por la docente (RF-018). Las fechas son días de Lima (AAAA-MM-DD). */
export interface AsignacionVista {
  id: string;
  tipo: TipoAsignacion;
  contenidoId: string;
  titulo: string;
  paraTodaElAula: boolean;
  estudiantes: EstudianteResumido[];
  fechaInicio: string;
  fechaLimite: string;
  estado: EstadoAsignacion;
  creadaEn: string;
}

/** "Misión del docente" en la aventura del estudiante (RF-018). */
export interface MisionDelDocenteVista {
  id: string;
  tipo: TipoAsignacion;
  contenidoId: string;
  titulo: string;
  fechaLimite: string;
  aula: string;
}

/** Código de invitación recién generado (RF-019): la docente lo ve una sola vez. */
export interface InvitacionVista {
  codigo: string;
  expiraEn: string;
  estudiante: EstudianteResumido;
  aula: { id: string; nombre: string };
}

export function vistaAula(aula: Aula, totalEstudiantes: number): AulaVista {
  const p = aula.propsSnapshot;
  return {
    id: p.id,
    nombre: p.nombre,
    grado: p.grado,
    anioLectivo: p.anioLectivo,
    institucion: p.institucion,
    codigo: p.codigo.value,
    estado: p.estado,
    totalEstudiantes,
    creadaEn: p.creadaEn.toISOString(),
  };
}

export function vistaAsignacion(a: Asignacion, ahora: Date, estudiantes: EstudianteResumido[]): AsignacionVista {
  const p = a.propsSnapshot;
  return {
    id: p.id,
    tipo: p.tipo,
    contenidoId: p.contenidoId,
    titulo: p.titulo,
    paraTodaElAula: a.paraTodaElAula,
    estudiantes,
    fechaInicio: FechaLima.delInstante(p.fechaInicio).value,
    fechaLimite: FechaLima.delInstante(p.fechaLimite).value,
    estado: a.estadoEn(ahora),
    creadaEn: p.creadaEn.toISOString(),
  };
}
