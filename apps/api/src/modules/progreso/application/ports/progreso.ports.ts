import { RangoEdad } from '../../../shared-kernel/public-api';
import { OrigenCambio, PerfilLector } from '../../domain/entities/perfil-lector';
import { Recomendacion } from '../../domain/services/recomendador';

/** Persistencia del perfil lector: `maestria_habilidad` (5 por estudiante) e `historial_maestria`. */
export interface PerfilRepository {
  buscar(estudianteId: string): Promise<PerfilLector | null>;
  /** Guarda los cambios y su historial en una transacción; `MaestriaDesactualizadaError` si otro guardó antes. */
  guardar(perfil: PerfilLector): Promise<void>;
  /** Idempotencia: ese reto, respuesta o valoración ya movió la maestría. */
  yaAplicado(origen: OrigenCambio, origenId: string): Promise<boolean>;
}

/** Las recomendaciones vigentes (`progreso.recomendacion`, RF-055). */
export interface RecomendacionRepository {
  vigentes(
    estudianteId: string,
  ): Promise<Pick<Recomendacion, 'tipo' | 'lecturaId' | 'asignacionId' | 'habilidad'>[]>;
  /** Deja vigentes solo estas, en orden de prioridad. */
  reemplazar(estudianteId: string, recomendaciones: Recomendacion[], ahora: Date): Promise<void>;
}

/** Anticorrupción hacia IAM. */
export interface IdentidadEstudiantes {
  rangoDe(estudianteId: string): Promise<RangoEdad | null>;
}

/** Anticorrupción hacia Escuela: lo que su docente le asignó y sigue en curso (RF-018). */
export interface AsignacionesEstudiante {
  vigentes(
    estudianteId: string,
  ): Promise<
    { asignacionId: string; tipo: 'LECTURA' | 'MISION'; contenidoId: string; titulo: string }[]
  >;
}
