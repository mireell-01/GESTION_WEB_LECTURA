/** Tipos de las respuestas de Escuela que usa la web (RF-014 a RF-020). */
import type { PerfilEstudiante } from '../iam/tipos';

export interface Aula {
  id: string;
  nombre: string;
  grado: string;
  anioLectivo: number;
  institucion: string;
  estado: 'ACTIVA' | 'ARCHIVADA';
  totalEstudiantes: number;
  creadaEn: string;
}

export interface EstudianteAula {
  id: string;
  alias: string;
  avatar: string;
  rangoEdad: PerfilEstudiante['rangoEdad'];
  activo: boolean;
  bloqueado: boolean;
  familiaresVinculados: number;
  matriculadoEn: string;
}

export interface DetalleAula {
  aula: Aula;
  estudiantes: EstudianteAula[];
}

export interface EstudianteMatriculado {
  estudianteId: string;
  alias: string;
  avatar: string;
}

export interface FilaRechazada {
  fila: number;
  contenido: string;
  motivo: string;
}

export type TipoAsignacion = 'LECTURA' | 'MISION';
export type EstadoAsignacion = 'PROGRAMADA' | 'ACTIVA' | 'VENCIDA' | 'CERRADA';

export interface Asignacion {
  id: string;
  tipo: TipoAsignacion;
  contenidoId: string;
  titulo: string;
  paraTodaElAula: boolean;
  estudiantes: { id: string; alias: string; avatar: string }[];
  fechaInicio: string;
  fechaLimite: string;
  estado: EstadoAsignacion;
}

export interface ContenidoAsignable {
  id: string;
  tipo: TipoAsignacion;
  titulo: string;
  detalle: string;
}

export interface Invitacion {
  codigo: string;
  expiraEn: string;
  estudiante: { id: string; alias: string; avatar: string };
  aula: { id: string; nombre: string };
}

/** "Misión del docente" en la aventura del estudiante (RF-018). */
export interface MisionDelDocente {
  id: string;
  tipo: TipoAsignacion;
  titulo: string;
  fechaLimite: string;
  aula: string;
}

export const NOMBRE_GRADO: Record<string, string> = {
  '1': '1.° grado',
  '2': '2.° grado',
  '3': '3.° grado',
  '4': '4.° grado',
  '5': '5.° grado',
  '6': '6.° grado',
};

export const ESTADO_ASIGNACION: Record<EstadoAsignacion, { texto: string; tipo?: 'exito' | 'aviso' | 'error' | 'info' }> = {
  PROGRAMADA: { texto: 'Programada', tipo: 'info' },
  ACTIVA: { texto: 'En curso', tipo: 'exito' },
  VENCIDA: { texto: 'Vencida', tipo: 'aviso' },
  CERRADA: { texto: 'Cerrada' },
};

/** Día AAAA-MM-DD (de Lima) en palabras: "jueves 22 de octubre". */
export function diaEnPalabras(dia: string): string {
  const [anio, mes, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(anio as number, (mes as number) - 1, d as number)).toLocaleDateString('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** Hoy en Lima como AAAA-MM-DD (valor por defecto de los campos de fecha). */
export function hoyEnLima(): string {
  return new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Guarda en el equipo un archivo que llegó de la API (p. ej. el PDF de tarjetas). */
export function guardarArchivo(archivo: Blob, nombre: string): void {
  const url = URL.createObjectURL(archivo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
