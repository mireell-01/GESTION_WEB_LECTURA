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
  /** La tiene puesta ahora (un accesorio y un personaje a la vez). */
  puesta: boolean;
}

/** Lo que tiene puesto: códigos de recompensa (LUPA, LLAMA…) o null. */
export interface Puestas {
  accesorio: string | null;
  personaje: string | null;
}

/** Su avatar con lo que tiene puesto. */
export interface Apariencia extends Puestas {
  avatar: string;
}

/** Un puesto de la Copa Lectora: solo alias, avatar y puntos de la semana. */
export interface PuestoCopa {
  posicion: number;
  alias: string;
  avatar: string;
  accesorio: string | null;
  puntos: number;
  soyYo: boolean;
}

/** La Copa Lectora del aula de esta semana. */
export interface CopaLectora {
  enAula: boolean;
  aula: string | null;
  semana: { desde: string; hasta: string; diasQuedan: number };
  totalAula: number;
  participantes: PuestoCopa[];
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
  puestas: Puestas;
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

/** Cómo se gana cada insignia, en palabras de niño (se muestra al tocarla). */
export const PISTA_INSIGNIA: Record<string, string> = {
  PRIMERA_LECTURA: 'Termina cualquier lectura de tu biblioteca o de tus mundos.',
  DETECTIVE_EVIDENCIAS: 'En las preguntas «Encuentra la evidencia», toca la oración del cuento que prueba tu respuesta.',
  MAESTRO_INFERENCIAS: 'Responde bien las preguntas que te piden descubrir lo que el cuento no dice.',
  LECTOR_PERSEVERANTE: 'Lee un poquito cada día, sin saltarte ninguno. ¡Tienes un comodín por semana!',
  RANGO_EXPLORADOR: 'Completa las 5 misiones del mundo Explorador.',
  RANGO_DETECTIVE: 'Completa las 5 misiones del mundo Detective.',
  RANGO_INVESTIGADOR: 'Completa las 5 misiones del mundo Investigador.',
  RANGO_CRITICO: 'Completa las 5 misiones del mundo Crítico.',
  MAESTRO_LECTURA: 'Completa las 5 misiones del mundo Maestro de la Lectura.',
};

/** Dónde luce cada accesorio sobre el avatar: en la cabeza, en la mano o en la espalda. */
export const LUGAR_ACCESORIO: Record<string, 'cabeza' | 'mano' | 'espalda'> = {
  LUPA: 'mano',
  GORRA: 'cabeza',
  CHULLO: 'cabeza',
  CAPA: 'espalda',
  CORONA: 'cabeza',
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
