import type { RangoEdad } from '../../../shared-kernel/public-api';
import { CuentaGamificacion, EstadoCuenta } from '../../domain/entities/cuenta-gamificacion';
import { RetoDiario } from '../../domain/entities/reto-diario';
import { SaldoMonedas } from '../../domain/services/monedas';
import { ParametrosGamificacion } from '../../domain/services/parametros';
import { MotivoPuntos } from '../../domain/services/politica-puntos';
import { EstadoRacha } from '../../domain/services/racha';
import { InsigniaCatalogo } from '../../domain/services/reglas-insignia';

/** Qué evento se aplica: el mismo tipo y origen nunca se aplican dos veces (reentregas del outbox). */
export interface ClaveEvento {
  tipo: 'ITEM' | 'LECTURA' | 'NIVEL' | 'MAESTRIA' | 'MUNDO';
  origenId: string;
}

export interface RecompensaCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  tipo: 'PERSONAJE' | 'ACCESORIO';
  costo: number;
}

/** Lo que muestra el pasaporte de la cuenta del estudiante (sin candado: es solo lectura). */
export interface ResumenCuenta {
  puntosTotales: number;
  puntosHoy: number;
  ganadas: Map<string, Date>;
  avances: Map<string, number>;
  racha: EstadoRacha;
  monedasGastadas: number;
  canjeadas: Set<string>;
  ultimos: { motivo: MotivoPuntos; puntos: number; creadoEn: Date }[];
}

export interface GamificacionRepository {
  /** RF-078: la versión vigente de los parámetros. */
  parametros(): Promise<ParametrosGamificacion>;
  /** RF-058: el catálogo de insignias activas con su regla. */
  insignias(): Promise<InsigniaCatalogo[]>;
  /**
   * Bajo un candado por estudiante: si el evento ya se aplicó devuelve null; si no, carga la cuenta,
   * la deja operar y guarda en una sola transacción los asientos, insignias, avances, racha y reto.
   */
  aplicar(estudianteId: string, clave: ClaveEvento, hoy: string, operar: (estado: EstadoCuenta) => CuentaGamificacion): Promise<CuentaGamificacion | null>;
  resumen(estudianteId: string, hoy: string): Promise<ResumenCuenta>;

  retoDe(estudianteId: string, fecha: string): Promise<RetoDiario | null>;
  /** RN-18: crea el reto del día (o devuelve el que ganó una carrera) y vence los anteriores sin completar. */
  proponerReto(reto: RetoDiario): Promise<RetoDiario>;

  recompensas(): Promise<RecompensaCatalogo[]>;
  /** RF-062: bajo el candado del estudiante, valida el saldo y registra el canje. Devuelve las monedas que quedan. */
  canjear(
    estudianteId: string,
    recompensa: RecompensaCatalogo,
    canje: { id: string; ahora: Date },
    validar: (saldo: SaldoMonedas & { yaEsTuya: boolean }) => void,
  ): Promise<number>;
}

/** Anticorrupción hacia IAM: lo que el pasaporte y los puntos necesitan del perfil del niño. */
export interface IdentidadEstudiantes {
  perfil(estudianteId: string): Promise<{ alias: string; avatar: string; rangoEdad: RangoEdad } | null>;
}
