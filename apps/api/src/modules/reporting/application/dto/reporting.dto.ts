import type { Habilidad, RespuestaDeHistorial } from '../../../shared-kernel/public-api';
import { Celda } from '../../domain/services/mapa-calor';
import { FilaReporte } from '../../domain/services/reporte-csv';
import { ResumenSemana } from '../../domain/services/resumen-semanal';
import { Riesgo } from '../../domain/services/riesgo';
import { Tasa } from '../../domain/services/tasa-sin-pista';

export interface AulaVista {
  id: string;
  nombre: string;
  grado: string;
  estado: string;
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

export interface GrupoHabilidad {
  habilidad: Habilidad;
  promedio: number | null;
  distribucion: { C: number; B: number; A: number; AD: number; descubriendo: number };
  /** Matriculados sin nada medido en la habilidad (sin reto inicial ni lecturas). */
  sinDatos: number;
}

export interface Refuerzo {
  habilidad: Habilidad;
  estudianteIds: string[];
  alias: string[];
  porcentaje: number;
  /** RF-066: la lectura para asignar con un clic (null si no hay una publicada para esa habilidad y edad). */
  lectura: { id: string; titulo: string; nivelDificultad: number } | null;
}

/** RF-063, RF-065, RF-066: el panel del aula. */
export interface PanelAula {
  aula: AulaVista;
  /** Cuándo se refrescaron las vistas de reportes (cada 5 minutos). */
  actualizadoEn: string | null;
  totalEstudiantes: number;
  grupo: GrupoHabilidad[];
  estudiantes: EstudiantePanel[];
  alertas: { estudianteId: string; alias: string; avatar: string; riesgo: Riesgo }[];
  resumenSemanal: { actual: ResumenSemana; anterior: ResumenSemana; enRiesgo: number };
  refuerzos: Refuerzo[];
}

export interface SesionDetalle {
  id: string;
  lecturaId: string;
  titulo: string;
  estado: string;
  esRepeticion: boolean;
  iniciadaEn: string;
  finalizadaEn: string | null;
  tasa: Tasa;
  respuestas: RespuestaDeHistorial[];
}

/** RF-064: el detalle individual por habilidad con las últimas 20 sesiones. */
export interface DetalleEstudiante {
  aula: AulaVista;
  estudiante: { id: string; alias: string; avatar: string };
  actualizadoEn: string | null;
  habilidades: (Celda & { tasa: Tasa })[];
  tasaSinPista: Tasa;
  ultimaActividad: string | null;
  riesgo: Riesgo;
  sesiones: SesionDetalle[];
}

/** RF-067: lo que va en el reporte de aula (PDF o CSV). */
export interface ReporteAula {
  aula: AulaVista;
  generadoEn: Date;
  actualizadoEn: Date | null;
  grupo: GrupoHabilidad[];
  filas: FilaReporte[];
  resumen: ResumenSemana;
  enRiesgo: number;
  refuerzos: Refuerzo[];
}

export interface ArchivoReporte {
  contenido: Uint8Array;
  tipo: string;
  nombreArchivo: string;
}
