import type { Habilidad } from '../../../shared-kernel/public-api';
import { MINUTOS_RETO, RetoDiario } from '../../domain/entities/reto-diario';
import { MotivoPuntos } from '../../domain/services/politica-puntos';

/** RF-060: el reto del día tal como lo ve el niño. */
export interface RetoVista {
  id: string;
  fecha: string;
  habilidad: Habilidad;
  meta: number;
  avance: number;
  estado: string;
  minutos: number;
  puntos: number;
  completadoEn: string | null;
  lectura: { id: string; titulo: string } | null;
}

export function vistaReto(r: RetoDiario, puntos: number): RetoVista {
  const d = r.datos;
  return {
    id: d.id,
    fecha: d.fecha,
    habilidad: d.habilidad,
    meta: d.meta,
    avance: d.avance,
    estado: d.estado,
    minutos: MINUTOS_RETO,
    puntos,
    completadoEn: d.completadoEn?.toISOString() ?? null,
    lectura: d.lectura,
  };
}

export interface InsigniaVista {
  codigo: string;
  nombre: string;
  descripcion: string;
  ganada: boolean;
  otorgadaEn: string | null;
  /** "3 de 5" en las de conteo y racha; null en las demás. */
  avance: number | null;
  meta: number | null;
}

export interface RecompensaVista {
  id: string;
  codigo: string;
  nombre: string;
  tipo: 'PERSONAJE' | 'ACCESORIO';
  costo: number;
  tuya: boolean;
  /** La tiene puesta ahora. */
  puesta: boolean;
}

/** Lo que el niño tiene puesto: códigos de recompensa (LUPA, LLAMA…) o null. */
export interface Puestas {
  accesorio: string | null;
  personaje: string | null;
}

/** RF-062: su avatar con lo que tiene puesto. */
export interface AparienciaVista extends Puestas {
  avatar: string;
}

/** Un puesto de la Copa Lectora: solo alias, avatar y puntos de la semana. */
export interface PuestoCopaVista {
  posicion: number;
  alias: string;
  avatar: string;
  accesorio: string | null;
  puntos: number;
  soyYo: boolean;
}

/** La Copa Lectora del aula de esta semana. */
export interface CopaVista {
  enAula: boolean;
  aula: string | null;
  semana: { desde: string; hasta: string; diasQuedan: number };
  /** Los puntos de toda el aula esta semana, para celebrar lo que logran juntos. */
  totalAula: number;
  participantes: PuestoCopaVista[];
}

/** RF-059: el Pasaporte del Lector. */
export interface PasaporteVista {
  alias: string;
  avatar: string;
  puntos: { total: number; hoy: number; topeDiario: number };
  nivel: { actual: number; desde: number; hasta: number; faltan: number };
  monedas: number;
  racha: { dias: number; mejor: number; leyoHoy: boolean; comodinDisponible: boolean };
  insignias: InsigniaVista[];
  mundos: { numero: number; nombre: string; completadoEn: string | null }[];
  lecturas: { total: number; recientes: { id: string; titulo: string; finalizadaEn: string }[] };
  ultimosPuntos: { motivo: MotivoPuntos; puntos: number; creadoEn: string }[];
  recompensas: RecompensaVista[];
  puestas: Puestas;
}

export interface CanjeVista {
  recompensa: string;
  monedas: number;
}
