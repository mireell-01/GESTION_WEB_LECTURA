import { Habilidad } from '../../../shared-kernel/public-api';

export type TipoRecomendacion =
  'ASIGNACION_DOCENTE' | 'LECTURA_MISION' | 'LECTURA_HABILIDAD_DEBIL' | 'REFUERZO';

/** RF-055: entre 1 y 3 recomendaciones vigentes por estudiante. */
export const MAX_RECOMENDACIONES = 3;

export interface Recomendacion {
  tipo: TipoRecomendacion;
  lecturaId: string | null;
  asignacionId: string | null;
  /** La misión (de la asignación o del mapa), si la recomendación viene de ella. */
  mision: { id: string; titulo: string } | null;
  habilidad: Habilidad | null;
  /** Para el docente y los reportes (el niño ve un texto propio). */
  motivo: string;
}

export interface CandidatosRecomendacion {
  /** Asignaciones docentes en curso, de la más próxima a vencer a la más lejana (RF-018). */
  asignaciones: {
    asignacionId: string;
    tipo: 'LECTURA' | 'MISION';
    contenidoId: string;
    titulo: string;
  }[];
  /** La lectura que sigue en la misión en curso del mapa (RF-032). */
  mision: { misionId: string; mision: string; lecturaId: string } | null;
  /** Lecturas publicadas de su edad con las habilidades que trabajan. */
  fichas: { id: string; nivelDificultad: number; habilidades: readonly Habilidad[] }[];
  terminadas: ReadonlySet<string>;
  habilidadDebil: Habilidad;
  /** Su nivel de lectura (1–5): RN-20 recomienda la dificultad de su nivel actual. */
  nivel: number;
}

/** Las fichas ordenadas por cercanía a su nivel (a igual distancia, la más fácil). */
function porCercania<T extends { nivelDificultad: number }>(
  fichas: readonly T[],
  nivel: number,
): T[] {
  return [...fichas].sort(
    (a, b) =>
      Math.abs(a.nivelDificultad - nivel) - Math.abs(b.nivelDificultad - nivel) ||
      a.nivelDificultad - b.nivelDificultad,
  );
}

/**
 * RN-20: si hay una asignación docente vigente, va primero (prioridad máxima); luego la lectura de
 * la misión en curso y una lectura de la habilidad más débil con la dificultad de su nivel. Nunca se
 * repite una lectura ni se recomienda una ya terminada. Si nada de eso aplica, se recomienda algo
 * para seguir practicando (RF-055: siempre al menos una, mientras haya lecturas de su edad).
 */
export function recomendar(c: CandidatosRecomendacion): Recomendacion[] {
  const lista: Recomendacion[] = [];
  const usadas = new Set<string>();
  const agregar = (r: Recomendacion) => {
    if (lista.length >= MAX_RECOMENDACIONES || (r.lecturaId && usadas.has(r.lecturaId))) return;
    if (r.lecturaId) usadas.add(r.lecturaId);
    lista.push(r);
  };

  const asignacion = c.asignaciones.find(
    (a) => a.tipo === 'MISION' || !c.terminadas.has(a.contenidoId),
  );
  if (asignacion) {
    agregar({
      tipo: 'ASIGNACION_DOCENTE',
      lecturaId: asignacion.tipo === 'LECTURA' ? asignacion.contenidoId : null,
      asignacionId: asignacion.asignacionId,
      mision:
        asignacion.tipo === 'MISION'
          ? { id: asignacion.contenidoId, titulo: asignacion.titulo }
          : null,
      habilidad: null,
      motivo: `Asignación de su docente: ${asignacion.titulo}`,
    });
  }
  if (c.mision && !c.terminadas.has(c.mision.lecturaId)) {
    agregar({
      tipo: 'LECTURA_MISION',
      lecturaId: c.mision.lecturaId,
      asignacionId: null,
      mision: { id: c.mision.misionId, titulo: c.mision.mision },
      habilidad: null,
      motivo: `Misión en curso: ${c.mision.mision}`,
    });
  }
  const pendientes = c.fichas.filter((f) => !c.terminadas.has(f.id) && !usadas.has(f.id));
  const paraLaDebil = porCercania(
    pendientes.filter((f) => f.habilidades.includes(c.habilidadDebil)),
    c.nivel,
  )[0];
  if (paraLaDebil) {
    agregar({
      tipo: 'LECTURA_HABILIDAD_DEBIL',
      lecturaId: paraLaDebil.id,
      asignacionId: null,
      mision: null,
      habilidad: c.habilidadDebil,
      motivo: `Habilidad por reforzar: ${c.habilidadDebil}`,
    });
  }

  if (lista.length === 0) {
    // Refuerzo: otra lectura de su nivel o, si ya leyó todas, volver a leer una de su habilidad más débil.
    const otra = porCercania(pendientes, c.nivel)[0];
    const releer = porCercania(
      c.fichas.filter((f) => c.terminadas.has(f.id)),
      c.nivel,
    ).sort(
      (a, b) =>
        Number(b.habilidades.includes(c.habilidadDebil)) -
        Number(a.habilidades.includes(c.habilidadDebil)),
    )[0];
    const elegida = otra ?? releer;
    if (elegida) {
      agregar({
        tipo: 'REFUERZO',
        lecturaId: elegida.id,
        asignacionId: null,
        mision: null,
        habilidad: c.habilidadDebil,
        motivo: otra ? 'Para seguir practicando' : 'Volver a leer para practicar',
      });
    }
  }
  return lista;
}
