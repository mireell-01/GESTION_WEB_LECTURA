import { Habilidad, RangoEdad } from '../../../shared-kernel/public-api';
import { Mision } from '../../domain/entities/mision';
import { ProgresoAventura } from '../../domain/entities/progreso-aventura';
import { EstadoMision } from '../../domain/services/politica-progresion';

/** Los 5 mundos del SRS (cargados por la migración, `aventura.mundo`). */
export interface MundoCatalogo {
  id: string;
  numero: number;
  nombre: string;
  descripcion: string;
  habilidadesFoco: Habilidad[];
}

/** Puerto de persistencia de Aventura (schema `aventura`). */
export interface AventuraRepository {
  /** Por número de mundo. */
  mundos(): Promise<MundoCatalogo[]>;

  progreso(estudianteId: string): Promise<ProgresoAventura | null>;
  /** Crea el progreso inicial; false si ya existía (otro pedido lo creó antes). */
  crearProgreso(progreso: ProgresoAventura): Promise<boolean>;
  /**
   * RF-031: completa un mundo disponible y desbloquea el siguiente en una transacción. false si el
   * mundo ya no estaba disponible (otro evento lo completó antes): así no se desbloquea dos veces.
   */
  avanzarMundo(
    estudianteId: string,
    completado: { mundoId: string; completadoEn: Date },
    desbloqueado: { mundoId: string; desbloqueadoEn: Date } | null,
  ): Promise<boolean>;
  /** RF-031: marca la celebración como vista solo si aún no lo estaba. */
  marcarCelebrado(estudianteId: string, mundoId: string, ahora: Date): Promise<void>;

  /** Por orden. */
  misiones(mundoId: string, rangoEdad: RangoEdad): Promise<Mision[]>;
  mision(id: string): Promise<Mision | null>;
  misionesConLectura(lecturaId: string, rangoEdad: RangoEdad): Promise<Mision[]>;
  /** Cantidad de misiones de cada mundo para un rango de edad (por id de mundo). */
  contarMisiones(rangoEdad: RangoEdad): Promise<Map<string, number>>;
  guardarMision(mision: Mision): Promise<void>;
  /** Guarda el orden nuevo de varias misiones en una sola transacción. */
  reordenar(misiones: Mision[]): Promise<void>;

  estadosMision(estudianteId: string, misionIds: string[]): Promise<Map<string, EstadoMision>>;
  guardarEstadoMision(estudianteId: string, misionId: string, estado: EstadoMision, ahora: Date): Promise<void>;
  /** Misiones completadas por el estudiante en cada mundo, entre las de su edad (por id de mundo). */
  completadasPorMundo(estudianteId: string, rangoEdad: RangoEdad): Promise<Map<string, number>>;
}
