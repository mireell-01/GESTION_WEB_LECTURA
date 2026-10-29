import type { Habilidad } from '@/features/diagnostico/tipos';
import type { PerfilEstudiante } from '@/features/iam/tipos';
import type { Celda } from '@/features/seguimiento/tipos';

type RangoEdad = PerfilEstudiante['rangoEdad'];

/** Contratos del acompañamiento familiar (Módulo 10, RF-068 a RF-070), tal como los entrega la API. */

export interface SemanaLectura {
  semana: string;
  minutos: number;
  lecturas: number;
  respuestas: number;
}

export interface Acompanamiento {
  habilidad: Habilidad;
  valor: number;
  consejos: string[];
  lectura: { id: string; titulo: string } | null;
}

export interface PanelHijo {
  estudiante: { id: string; alias: string; avatar: string; rangoEdad: RangoEdad; activo: boolean; relacion: 'RESPONSABLE' | 'VINCULADO' };
  actualizadoEn: string | null;
  semana: { actual: SemanaLectura; anterior: SemanaLectura };
  avance: {
    lecturasTerminadas: number;
    mundosCompletados: number;
    mundoActual: { numero: number; nombre: string } | null;
    puntos: number;
    insignias: number;
    ultimaActividad: string | null;
  };
  habilidades: Celda[];
  aReforzar: Acompanamiento[];
  habito: string[];
}

export interface PreferenciasFamilia {
  resumenSemanal: boolean;
}

/** Cada habilidad en palabras de la familia: su nombre y qué significa. */
export const HABILIDAD_FAMILIA: Record<Habilidad, { nombre: string; queEs: string }> = {
  LIT: { nombre: 'Comprensión literal', queEs: 'Encontrar lo que dice el texto' },
  INF: { nombre: 'Inferencias', queEs: 'Descubrir lo que no se dice' },
  VOC: { nombre: 'Vocabulario', queEs: 'Entender palabras nuevas' },
  CRI: { nombre: 'Pensamiento crítico', queEs: 'Opinar sobre lo que lee' },
  ARG: { nombre: 'Argumentación', queEs: 'Dar buenas razones' },
};

/** "15 min más que la semana anterior", "Igual que…", "5 min menos que…"; sin lectura en ninguna, solo el dato. */
export function comparacionSemana(actual: number, anterior: number): string {
  if (actual === 0 && anterior === 0) return 'La semana anterior: 0 min';
  if (actual === anterior) return 'Igual que la semana anterior';
  return `${Math.abs(actual - anterior)} min ${actual > anterior ? 'más' : 'menos'} que la semana anterior`;
}
