export const ESTADOS_MUNDO = ['BLOQUEADO', 'DISPONIBLE', 'COMPLETADO'] as const;
export type EstadoMundo = (typeof ESTADOS_MUNDO)[number];

export interface EstadoDeMundo {
  mundoId: string;
  numero: number;
  estado: EstadoMundo;
  desbloqueadoEn: Date | null;
  completadoEn: Date | null;
  /** RF-031: cuándo vio el niño la celebración del desbloqueo. */
  celebradoEn: Date | null;
}

export interface MundoRef {
  id: string;
  numero: number;
}

/**
 * Agregado ProgresoAventura (RF-030, RF-031, RF-033): el estado de los 5 mundos para un estudiante.
 * Forma siempre válida: primero los mundos completados, luego a lo sumo un mundo disponible (el
 * actual) y después los bloqueados. Así ningún mundo está COMPLETADO con el anterior BLOQUEADO
 * (invariante del SRS §6).
 */
export class ProgresoAventura {
  private constructor(
    readonly estudianteId: string,
    private readonly estados: EstadoDeMundo[],
  ) {
    ProgresoAventura.validar(estados);
  }

  /** RF-033: los mundos anteriores al inicial quedan completados; el inicial, disponible y sin celebración. */
  static posicionar(estudianteId: string, mundos: MundoRef[], inicial: number, ahora: Date): ProgresoAventura {
    const ordenados = [...mundos].sort((a, b) => a.numero - b.numero);
    if (!ordenados.some((m) => m.numero === inicial)) throw new Error(`No existe el mundo ${inicial}`);
    return new ProgresoAventura(
      estudianteId,
      ordenados.map((m) => {
        if (m.numero < inicial) return { mundoId: m.id, numero: m.numero, estado: 'COMPLETADO', desbloqueadoEn: ahora, completadoEn: ahora, celebradoEn: ahora };
        if (m.numero === inicial) return { mundoId: m.id, numero: m.numero, estado: 'DISPONIBLE', desbloqueadoEn: ahora, completadoEn: null, celebradoEn: ahora };
        return { mundoId: m.id, numero: m.numero, estado: 'BLOQUEADO', desbloqueadoEn: null, completadoEn: null, celebradoEn: null };
      }),
    );
  }

  static desdePersistencia(estudianteId: string, estados: EstadoDeMundo[]): ProgresoAventura {
    return new ProgresoAventura(estudianteId, [...estados].sort((a, b) => a.numero - b.numero).map((e) => ({ ...e })));
  }

  get mundos(): EstadoDeMundo[] {
    return this.estados.map((e) => ({ ...e }));
  }

  /** El mundo que el estudiante está recorriendo (null si ya completó los 5). */
  get actual(): EstadoDeMundo | null {
    const e = this.estados.find((m) => m.estado === 'DISPONIBLE');
    return e ? { ...e } : null;
  }

  estadoDe(mundoId: string): EstadoDeMundo | null {
    const e = this.estados.find((m) => m.mundoId === mundoId);
    return e ? { ...e } : null;
  }

  /** RF-031: completa el mundo actual y desbloquea el siguiente (null si era el último). */
  completarActual(ahora: Date): { completado: EstadoDeMundo; desbloqueado: EstadoDeMundo | null } {
    const i = this.estados.findIndex((m) => m.estado === 'DISPONIBLE');
    if (i < 0) throw new Error('No hay un mundo disponible que completar');
    const actual = this.estados[i] as EstadoDeMundo;
    actual.estado = 'COMPLETADO';
    actual.completadoEn = ahora;
    const siguiente = this.estados[i + 1];
    if (siguiente) {
      siguiente.estado = 'DISPONIBLE';
      siguiente.desbloqueadoEn = ahora;
    }
    ProgresoAventura.validar(this.estados);
    return { completado: { ...actual }, desbloqueado: siguiente ? { ...siguiente } : null };
  }

  /** RF-031: mundos desbloqueados cuya celebración el niño aún no vio. */
  porCelebrar(): EstadoDeMundo[] {
    return this.estados.filter((m) => m.desbloqueadoEn !== null && m.celebradoEn === null).map((m) => ({ ...m }));
  }

  /** La celebración se muestra una sola vez. Devuelve false si no había nada que marcar. */
  marcarCelebrado(mundoId: string, ahora: Date): boolean {
    const m = this.estados.find((e) => e.mundoId === mundoId);
    if (!m || m.desbloqueadoEn === null || m.celebradoEn !== null) return false;
    m.celebradoEn = ahora;
    return true;
  }

  private static validar(estados: EstadoDeMundo[]): void {
    if (estados.length === 0) throw new Error('El progreso de aventura necesita los mundos del catálogo');
    estados.forEach((e, i) => {
      if (e.numero !== i + 1) throw new Error('Los mundos del progreso deben ir del 1 al último, sin saltos');
    });
    const completados = estados.findIndex((e) => e.estado !== 'COMPLETADO');
    const prefijo = completados < 0 ? estados.length : completados;
    estados.forEach((e, i) => {
      const esperado: EstadoMundo = i < prefijo ? 'COMPLETADO' : i === prefijo ? 'DISPONIBLE' : 'BLOQUEADO';
      if (e.estado !== esperado) throw new Error(`Progreso inválido: el mundo ${e.numero} está ${e.estado}`);
      const fechasOk =
        e.estado === 'BLOQUEADO'
          ? e.desbloqueadoEn === null && e.completadoEn === null
          : e.estado === 'DISPONIBLE'
            ? e.desbloqueadoEn !== null && e.completadoEn === null
            : e.desbloqueadoEn !== null && e.completadoEn !== null;
      if (!fechasOk) throw new Error(`Progreso inválido: fechas del mundo ${e.numero}`);
    });
  }
}
