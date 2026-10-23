import type { Habilidad } from '@/features/diagnostico/tipos';

/** Contratos del Pasaporte del Lector, el reto del día y las recompensas (Módulo 8, RF-056 a RF-062), tal como los entrega la API. */

export interface Insignia {
  codigo: string;
  nombre: string;
  descripcion: string;
  ganada: boolean;
  otorgadaEn: string | null;
  /** "3 de 5" en las que se ganan contando; null en las demás. */
  avance: number | null;
  meta: number | null;
}

export interface Recompensa {
  id: string;
  codigo: string;
  nombre: string;
  tipo: 'PERSONAJE' | 'ACCESORIO';
  costo: number;
  tuya: boolean;
}

export interface Pasaporte {
  alias: string;
  avatar: string;
  puntos: { total: number; hoy: number; topeDiario: number };
  nivel: { actual: number; desde: number; hasta: number; faltan: number };
  monedas: number;
  racha: { dias: number; mejor: number; leyoHoy: boolean; comodinDisponible: boolean };
  insignias: Insignia[];
  mundos: { numero: number; nombre: string; completadoEn: string | null }[];
  lecturas: { total: number; recientes: { id: string; titulo: string; finalizadaEn: string }[] };
  ultimosPuntos: { motivo: string; puntos: number; creadoEn: string }[];
  recompensas: Recompensa[];
}

export interface RetoDelDia {
  id: string;
  fecha: string;
  habilidad: Habilidad;
  meta: number;
  avance: number;
  estado: 'PROPUESTO' | 'COMPLETADO' | 'VENCIDO';
  minutos: number;
  puntos: number;
  completadoEn: string | null;
  lectura: { id: string; titulo: string } | null;
}

/** Cada insignia con su dibujo (las que faltan se muestran en gris con candado). */
export const EMOJI_INSIGNIA: Record<string, string> = {
  PRIMERA_LECTURA: '📖',
  DETECTIVE_EVIDENCIAS: '🔎',
  MAESTRO_INFERENCIAS: '💡',
  LECTOR_PERSEVERANTE: '🔥',
  RANGO_EXPLORADOR: '🧭',
  RANGO_DETECTIVE: '🕵️',
  RANGO_INVESTIGADOR: '🔬',
  RANGO_CRITICO: '⚖️',
  MAESTRO_LECTURA: '🏆',
};

/** RF-062: los personajes y accesorios del avatar. */
export const EMOJI_RECOMPENSA: Record<string, string> = {
  LUPA: '🔍',
  GORRA: '🧢',
  CHULLO: '🧶',
  CAPA: '🦸',
  CORONA: '👑',
  LLAMA: '🦙',
  CONDOR: '🦅',
  OSO_ANTEOJOS: '🐻',
  COLIBRI: '🐦',
  DRAGON: '🐉',
};

const MOTIVOS: Record<string, string> = {
  ITEM_CORRECTO: 'Respuesta correcta',
  CORRECTO_TRAS_PISTA: 'Corregiste con una pista',
  RESPUESTA_ABIERTA: 'Escribiste tu respuesta',
  LECTURA_COMPLETADA: 'Lectura terminada',
  SUBIDA_NIVEL_CNEB: 'Creciste en una habilidad',
  RETO_DEL_DIA: 'Reto del día cumplido',
};

/** RF-056: por qué ganó esos puntos, en palabras de niño. */
export function motivoInfantil(motivo: string): string {
  const racha = /^RACHA_(\d+)$/.exec(motivo);
  return racha ? `Racha de ${racha[1]} días` : (MOTIVOS[motivo] ?? 'Puntos ganados');
}
