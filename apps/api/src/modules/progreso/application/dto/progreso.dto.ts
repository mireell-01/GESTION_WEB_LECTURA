import {
  ETIQUETA_NIVEL,
  NivelCNEB,
  nivelDeclarado,
  RangoEdad,
} from '../../../shared-kernel/public-api';
import { PerfilLector } from '../../domain/entities/perfil-lector';
import { aReforzar, nivelLectura } from '../../domain/services/maestria';
import { TipoRecomendacion } from '../../domain/services/recomendador';

/** RF-052: el perfil lector que ve el niño. */
export interface PerfilVista {
  habilidades: {
    codigo: string;
    /** 0–100, redondeado para la barra. */
    valor: number;
    itemsContados: number;
    /** RN-08: null mientras tenga menos de 5 ítems. */
    nivel: NivelCNEB | null;
    /** En inicio · En proceso · Logrado · Destacado · Aún descubriendo. */
    etiqueta: string;
    /** RF-054. */
    aReforzar: boolean;
  }[];
  /** Dificultad (1–5) en que lee hoy; null si todavía no hay nada medido. */
  nivelLectura: number | null;
  conDatos: boolean;
  actualizadoEn: string | null;
}

/** RF-055: una recomendación, lista para mostrar. */
export interface RecomendacionVista {
  tipo: TipoRecomendacion;
  prioridad: number;
  lectura: { id: string; titulo: string; nivelDificultad: number } | null;
  habilidad: string | null;
  mision: { id: string; titulo: string } | null;
  asignacionId: string | null;
  /** La lectura ya está empezada: "Sigue leyendo". */
  enCurso: boolean;
}

export function vistaPerfil(perfil: PerfilLector, rango: RangoEdad): PerfilVista {
  const fechas = perfil
    .todas()
    .map((m) => m.actualizadoEn)
    .filter((f): f is Date => f !== null);
  return {
    habilidades: perfil.todas().map((m) => {
      const nivel = nivelDeclarado(m.valor, m.itemsContados);
      return {
        codigo: m.habilidad,
        valor: Math.round(m.valor),
        itemsContados: m.itemsContados,
        nivel,
        etiqueta: nivel ? ETIQUETA_NIVEL[nivel] : 'Aún descubriendo',
        aReforzar: aReforzar(m.valor, m.itemsContados),
      };
    }),
    nivelLectura: perfil.tieneHistoria ? nivelLectura(rango, perfil.promedio()) : null,
    conDatos: perfil.tieneHistoria,
    actualizadoEn: fechas.length
      ? new Date(Math.max(...fechas.map((f) => f.getTime()))).toISOString()
      : null,
  };
}
