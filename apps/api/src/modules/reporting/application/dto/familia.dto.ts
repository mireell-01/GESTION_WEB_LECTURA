import type { Habilidad } from '../../../shared-kernel/public-api';
import { Celda } from '../../domain/services/mapa-calor';
import { AvanceEstudiante, HijoFamilia } from '../ports/familia.ports';

/** Cuánto leyó en una semana de Lima (su lunes). */
export interface SemanaLectura {
  semana: string;
  minutos: number;
  lecturas: number;
  respuestas: number;
}

/** RF-069: cómo acompañar en casa una habilidad a reforzar. */
export interface Acompanamiento {
  habilidad: Habilidad;
  valor: number;
  consejos: string[];
  /** Una lectura publicada de su edad que la trabaja y que aún no terminó. */
  lectura: { id: string; titulo: string } | null;
}

/** RF-068, RF-069: el panel de un hijo para su familia. */
export interface PanelHijo {
  estudiante: Pick<HijoFamilia, 'id' | 'alias' | 'avatar' | 'rangoEdad' | 'activo' | 'relacion'>;
  /** Cuándo se refrescaron las vistas de reportes (cada 5 minutos). */
  actualizadoEn: string | null;
  semana: { actual: SemanaLectura; anterior: SemanaLectura };
  avance: AvanceEstudiante & { ultimaActividad: string | null };
  habilidades: Celda[];
  /** Hasta 3 habilidades por debajo de "Logrado", de la más baja a la más alta. */
  aReforzar: Acompanamiento[];
  /** Para mantener el hábito (se muestran siempre; son los únicos si no hay nada por reforzar). */
  habito: string[];
}

/** RF-070: preferencia de notificaciones de la familia. */
export interface PreferenciasFamilia {
  resumenSemanal: boolean;
}
