/** Tipos de las respuestas del Diagnóstico que usa la web (RF-034 a RF-037) y sus nombres en pantalla. */

export type TipoReto = 'INICIAL' | 'REEVALUACION';
export type EstadoReto = 'NO_INICIADO' | 'EN_CURSO' | 'PAUSADO' | 'FINALIZADO';
export type Habilidad = 'LIT' | 'INF' | 'VOC' | 'CRI' | 'ARG';

export interface Reto {
  id: string | null;
  tipo: TipoReto;
  estado: EstadoReto;
  respondidos: number;
  total: number;
}

export interface RetoActual {
  inicialFinalizado: boolean;
  pendiente: Reto | null;
}

export interface Pregunta {
  itemId: string;
  numero: number;
  total: number;
  lectura: { titulo: string; texto: string };
  enunciado: string;
  opciones: string[];
}

export interface ResultadoReto {
  diagnosticoId: string;
  tipo: TipoReto;
  aciertos: number;
  total: number;
  habilidades: { codigo: Habilidad; nombre: string; valor: number; nivel: string; etiquetaNivel: string; nivelDeclarado: string | null }[];
}

export interface ReevaluacionEstudiante {
  estudianteId: string;
  alias: string;
  avatar: string;
  inicial: { estado: EstadoReto | 'SIN_EMPEZAR'; valores: Record<Habilidad, number> | null };
  reevaluacion: { secuencia: number; estado: EstadoReto; respondidos: number; total: number; valores: Record<Habilidad, number> | null } | null;
  cambios: Record<Habilidad, number> | null;
}

/** Cómo se nombra cada habilidad para un niño (en el resultado del reto). */
export const HABILIDAD_INFANTIL: Record<Habilidad, string> = {
  LIT: 'Encontrar lo que dice el texto',
  VOC: 'Entender palabras nuevas',
  INF: 'Descubrir lo que no se dice',
  CRI: 'Opinar sobre lo que lees',
  ARG: 'Dar buenas razones',
};

export const HABILIDAD_CORTA: Record<Habilidad, string> = { LIT: 'Literal', INF: 'Inferencia', VOC: 'Vocabulario', CRI: 'Crítico', ARG: 'Argumentación' };

export const ORDEN: Habilidad[] = ['LIT', 'VOC', 'INF', 'CRI', 'ARG'];

/** Estrellas para el niño: un logro, nunca una nota (0–3). */
export function estrellas(valor: number): number {
  if (valor >= 85) return 3;
  if (valor >= 65) return 2;
  if (valor >= 40) return 1;
  return 0;
}
