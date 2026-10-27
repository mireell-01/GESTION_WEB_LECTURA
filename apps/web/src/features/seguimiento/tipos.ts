import type { Habilidad } from '@/features/diagnostico/tipos';
import { ErrorApi, mensajeDeError } from '@/shared/api/client';

/** Contratos del seguimiento docente (Módulo 9, RF-063 a RF-067), tal como los entrega la API. */

export type NivelCNEB = 'C' | 'B' | 'A' | 'AD';
export type MotivoRiesgo = 'SIN_ACTIVIDAD' | 'HABILIDADES_EN_INICIO';

export interface Celda {
  habilidad: Habilidad;
  valor: number | null;
  items: number;
  nivel: NivelCNEB | null;
}

export interface Riesgo {
  enRiesgo: boolean;
  motivos: MotivoRiesgo[];
  diasSinActividad: number | null;
  habilidadesEnInicio: Habilidad[];
}

export interface EstudiantePanel {
  id: string;
  alias: string;
  avatar: string;
  celdas: Celda[];
  ultimaActividad: string | null;
  lecturasSemana: number;
  riesgo: Riesgo;
}

export interface ResumenSemana {
  semana: string;
  estudiantesActivos: number;
  totalEstudiantes: number;
  lecturasFinalizadas: number;
  minutosLectura: number;
  respuestas: number;
}

export interface Refuerzo {
  habilidad: Habilidad;
  estudianteIds: string[];
  alias: string[];
  porcentaje: number;
  lectura: { id: string; titulo: string; nivelDificultad: number } | null;
}

export interface PanelAula {
  aula: { id: string; nombre: string; grado: string; estado: string };
  actualizadoEn: string | null;
  totalEstudiantes: number;
  grupo: { habilidad: Habilidad; promedio: number | null; distribucion: Record<NivelCNEB | 'descubriendo', number>; sinDatos: number }[];
  estudiantes: EstudiantePanel[];
  alertas: { estudianteId: string; alias: string; avatar: string; riesgo: Riesgo }[];
  resumenSemanal: { actual: ResumenSemana; anterior: ResumenSemana; enRiesgo: number };
  refuerzos: Refuerzo[];
}

export interface Tasa {
  cerradas: number;
  sinPista: number;
  tasa: number | null;
}

export interface RespuestaDetalle {
  itemId: string;
  enunciado: string;
  habilidad: Habilidad;
  modalidad: string;
  esCorrecta: boolean | null;
  pistasUsadas: number;
  pistas: { nivel: string; texto: string | null }[];
  evidencias: string[];
  respuesta: string | null;
  estado: string;
}

export interface DetalleEstudiante {
  aula: { id: string; nombre: string };
  estudiante: { id: string; alias: string; avatar: string };
  actualizadoEn: string | null;
  habilidades: (Celda & { tasa: Tasa })[];
  tasaSinPista: Tasa;
  ultimaActividad: string | null;
  riesgo: Riesgo;
  sesiones: {
    id: string;
    lecturaId: string;
    titulo: string;
    estado: string;
    esRepeticion: boolean;
    iniciadaEn: string;
    finalizadaEn: string | null;
    tasa: Tasa;
    respuestas: RespuestaDetalle[];
  }[];
}

/** Las 5 habilidades en el orden del SRS (columnas del mapa de calor). */
export const HABILIDADES: Habilidad[] = ['LIT', 'INF', 'VOC', 'CRI', 'ARG'];

/** Nombres para la docente (los del SRS). */
export const NOMBRE_HABILIDAD: Record<Habilidad, string> = {
  LIT: 'Comprensión literal',
  INF: 'Inferencias',
  VOC: 'Vocabulario',
  CRI: 'Pensamiento crítico',
  ARG: 'Argumentación',
};

export const NOMBRE_NIVEL: Record<NivelCNEB, string> = { C: 'En inicio', B: 'En proceso', A: 'Logrado', AD: 'Destacado' };

export const ESTADO_SESION: Record<string, string> = {
  INICIADA: 'Empezada',
  EN_CURSO: 'En curso',
  FINALIZADA: 'Terminada',
  ABANDONADA: 'Abandonada',
};

/** Texto del nivel de una celda, también para lectores de pantalla. */
export function textoCelda(c: Celda): string {
  if (c.valor === null) return 'sin datos';
  return c.nivel ? `${NOMBRE_NIVEL[c.nivel]} (${Math.round(c.valor)})` : `Aún descubriendo (${Math.round(c.valor)})`;
}

/** RN-17: un aula ajena (o un estudiante que no es del aula) se ve igual que una que no existe. */
export function mensajeDeSeguimiento(err: unknown, noEncontrado: string): string {
  return err instanceof ErrorApi && err.estado === 404 ? noEncontrado : mensajeDeError(err);
}

/** Los motivos de la alerta, en palabras de la docente. */
export function motivosRiesgo(r: Riesgo): string[] {
  return r.motivos.map((m) =>
    m === 'SIN_ACTIVIDAD'
      ? r.diasSinActividad === null
        ? 'Aún no empieza a leer'
        : `${r.diasSinActividad} días sin actividad`
      : `${r.habilidadesEnInicio.length} habilidades en inicio: ${r.habilidadesEnInicio.map((h) => NOMBRE_HABILIDAD[h].toLowerCase()).join(', ')}`,
  );
}

export function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', timeZone: 'America/Lima' });
}

export function horaLima(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' });
}
