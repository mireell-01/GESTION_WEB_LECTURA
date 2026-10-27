import type { RangoEdad } from '../../../shared-kernel/public-api';
import { MaestriaMedida } from '../../domain/services/mapa-calor';
import { ReportesRepository } from './reporting.ports';

/** RF-068: el avance del estudiante (fila de `reporting.mv_avance_estudiante`). */
export interface AvanceEstudiante {
  lecturasTerminadas: number;
  mundosCompletados: number;
  /** El mundo disponible en que va; null si aún no abre el mapa (reto inicial pendiente). */
  mundoActual: { numero: number; nombre: string } | null;
  puntos: number;
  insignias: number;
}

/** Lectura de las vistas del schema `reporting` para la familia (SAD §5) y sus preferencias. */
export interface ReportesFamiliaRepository extends Pick<ReportesRepository, 'refrescadoEn' | 'actividadSemanal' | 'ultimaActividad'> {
  /** La maestría del estudiante por habilidad, esté o no en un aula. */
  maestriasPerfil(estudianteId: string): Promise<MaestriaMedida[]>;
  avance(estudianteId: string): Promise<AvanceEstudiante | null>;
  /** RF-070: familias activas con sus hijos activos (vista simple `v_hijos_familia`). */
  hijosPorFamilia(): Promise<Map<string, string[]>>;
  /** Si recibe el resumen semanal; sin preferencia guardada, sí (baja con un clic). */
  preferencias(cuentaIds: string[]): Promise<Map<string, boolean>>;
  guardarPreferencia(cuentaId: string, resumenSemanal: boolean): Promise<void>;
  /** RF-070: registra el resumen de la semana; false si ya se había enviado (una vez por familia y semana). */
  registrarResumenFamiliar(cuentaId: string, semana: string, hijos: number): Promise<boolean>;
  /** Deshace el registro cuando el correo no pudo salir, para reintentarlo en el próximo ciclo. */
  liberarResumenFamiliar(cuentaId: string, semana: string): Promise<void>;
}

/** Un hijo que la familia acompaña: propio (RF-071) o por invitación de su docente (RF-019). */
export interface HijoFamilia {
  id: string;
  alias: string;
  avatar: string;
  rangoEdad: RangoEdad;
  activo: boolean;
  relacion: 'RESPONSABLE' | 'VINCULADO';
}

/** Anticorrupción hacia IAM: los hijos vinculados a la cuenta (RN-17: solo esos). */
export interface HijosFamilia {
  hijosDe(cuentaId: string): Promise<HijoFamilia[]>;
}

/** Anticorrupción hacia IAM: un correo a la familia; su dirección no sale de IAM. */
export interface NotificadorFamilia {
  notificar(cuentaId: string, mensaje: { asunto: string; texto: string; enlace?: string; bajaUrl?: string }): Promise<boolean>;
}

/** RF-070: el enlace de baja con un clic lleva la cuenta firmada; no vence ni sirve para otra cosa. */
export interface FirmaBaja {
  token(cuentaId: string): string;
  /** La cuenta del enlace, o null si la firma no es válida. */
  cuentaDe(token: string): string | null;
}
