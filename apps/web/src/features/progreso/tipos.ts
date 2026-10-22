/** Contratos del perfil lector y las recomendaciones (Módulo 7, RF-052 a RF-055), tal como los entrega la API. */

export type NivelCNEB = 'C' | 'B' | 'A' | 'AD';

export interface HabilidadPerfil {
  codigo: 'LIT' | 'INF' | 'VOC' | 'CRI' | 'ARG';
  valor: number;
  itemsContados: number;
  /** RN-08: null mientras tenga menos de 5 ítems ("Aún descubriendo"). */
  nivel: NivelCNEB | null;
  etiqueta: string;
  aReforzar: boolean;
}

export interface PerfilLector {
  habilidades: HabilidadPerfil[];
  nivelLectura: number | null;
  conDatos: boolean;
  actualizadoEn: string | null;
}

export type TipoRecomendacion = 'ASIGNACION_DOCENTE' | 'LECTURA_MISION' | 'LECTURA_HABILIDAD_DEBIL' | 'REFUERZO';

export interface Recomendacion {
  tipo: TipoRecomendacion;
  prioridad: number;
  lectura: { id: string; titulo: string; nivelDificultad: number } | null;
  habilidad: HabilidadPerfil['codigo'] | null;
  mision: { id: string; titulo: string } | null;
  asignacionId: string | null;
  enCurso: boolean;
}

/** El color del nivel: siempre en positivo (nunca rojo para un niño). */
export const CHIP_NIVEL: Record<NivelCNEB, 'exito' | 'info' | 'aviso'> = { AD: 'exito', A: 'exito', B: 'info', C: 'aviso' };
