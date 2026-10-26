import type { RangoEdad } from '../../../shared-kernel/public-api';
import { MaestriaMedida } from '../../domain/services/mapa-calor';
import { ActividadSemanal } from '../../domain/services/resumen-semanal';
import { ReporteAula } from '../dto/reporting.dto';

/** Distribución del aula en una habilidad (fila de `reporting.mv_desempeno_aula`). */
export interface DesempenoHabilidad {
  habilidad: string;
  estudiantes: number;
  promedio: number;
  descubriendo: number;
  C: number;
  B: number;
  A: number;
  AD: number;
}

export interface AulaActiva {
  aulaId: string;
  docenteId: string;
  nombre: string;
  estudiantes: number;
}

/** Lectura de las vistas del schema `reporting` (SAD §5: la lectura agregada entre módulos va por ellas). */
export interface ReportesRepository {
  /** Último refresco de las vistas materializadas (cada 5 minutos). */
  refrescadoEn(): Promise<Date | null>;
  refrescar(): Promise<void>;
  /** Matrícula activa del aula (vista simple: siempre al día). */
  estudiantesDeAula(aulaId: string): Promise<{ estudianteId: string; matriculadoEn: Date }[]>;
  maestrias(aulaId: string): Promise<(MaestriaMedida & { estudianteId: string })[]>;
  desempeno(aulaId: string): Promise<DesempenoHabilidad[]>;
  ultimaActividad(estudianteIds: string[]): Promise<Map<string, Date>>;
  actividadSemanal(estudianteIds: string[], semanas: string[]): Promise<ActividadSemanal[]>;
  aulasActivas(): Promise<AulaActiva[]>;
  /** RF-065: registra el resumen de la semana; false si ya se había enviado (una vez por docente y semana). */
  registrarResumen(docenteId: string, semana: string, aulas: number): Promise<boolean>;
  /** Deshace el registro cuando el correo no pudo salir, para reintentarlo en el próximo ciclo. */
  liberarResumen(docenteId: string, semana: string): Promise<void>;
}

/** Anticorrupción hacia Escuela: el aula solo si es de la docente (RN-17), activa o archivada. */
export interface AulasDocente {
  aulaDe(docenteId: string, aulaId: string): Promise<{ id: string; nombre: string; grado: string; estado: string } | null>;
  /** Sin verificar dueño: lo usa el resumen semanal, que ya recorre las aulas de cada docente. */
  aula(aulaId: string): Promise<{ id: string; nombre: string; grado: string; estado: string } | null>;
}

/** Anticorrupción hacia IAM: alias, avatar y edad de los estudiantes. */
export interface IdentidadEstudiantes {
  perfiles(ids: string[]): Promise<{ id: string; alias: string; avatar: string; rangoEdad: RangoEdad }[]>;
}

/** Anticorrupción hacia IAM: un correo a la docente (su dirección no sale de IAM). */
export interface NotificadorDocente {
  notificar(docenteId: string, mensaje: { asunto: string; texto: string; enlace?: string }): Promise<boolean>;
}

/** RF-067: el reporte de aula en PDF. */
export interface GeneradorReportePdf {
  generar(reporte: ReporteAula): Promise<Uint8Array>;
}
