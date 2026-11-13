import { Habilidad, HABILIDADES, Maestrias } from '../../../shared-kernel/public-api';

export type EstadoReto = 'PROPUESTO' | 'COMPLETADO' | 'VENCIDO';

/** RF-060: 3 respuestas bien hechas de la habilidad del reto, unos 5 minutos de lectura. */
export const META_RETO = 3;
export const MINUTOS_RETO = 5;

export interface LecturaSugerida {
  id: string;
  titulo: string;
}

export interface DatosReto {
  id: string;
  estudianteId: string;
  /** Fecha de Lima del reto ("AAAA-MM-DD"). */
  fecha: string;
  habilidad: Habilidad;
  meta: number;
  avance: number;
  estado: EstadoReto;
  completadoEn: Date | null;
  lectura: LecturaSugerida | null;
}

/** RF-060: las habilidades de la más débil a la más fuerte (menor maestría; empate: el orden del SRS). */
export function habilidadesPorDebilidad(maestrias: Maestrias | null): Habilidad[] {
  return [...HABILIDADES].sort((a, b) => (maestrias?.[a] ?? 0) - (maestrias?.[b] ?? 0) || HABILIDADES.indexOf(a) - HABILIDADES.indexOf(b));
}

/** RF-060: el reto apunta a la habilidad más débil. */
export function habilidadDelReto(maestrias: Maestrias | null): Habilidad {
  return habilidadesPorDebilidad(maestrias)[0]!;
}

/**
 * Entidad: RetoDiario (RF-060, RN-18) — uno por estudiante por fecha de Lima. Avanza con cada pregunta
 * bien respondida de su habilidad (o una respuesta abierta con esfuerzo, RN-19) y se completa al llegar
 * a la meta. Un reto de un día anterior sin completar queda VENCIDO.
 */
export class RetoDiario {
  private constructor(private d: DatosReto) {}

  static proponer(p: { id: string; estudianteId: string; fecha: string; habilidad: Habilidad; lectura: LecturaSugerida | null }): RetoDiario {
    return new RetoDiario({ ...p, meta: META_RETO, avance: 0, estado: 'PROPUESTO', completadoEn: null });
  }

  static desdePersistencia(d: DatosReto): RetoDiario {
    return new RetoDiario({ ...d });
  }

  get id(): string {
    return this.d.id;
  }

  get datos(): Readonly<DatosReto> {
    return this.d;
  }

  /**
   * Un reto que se propuso sin cuento (aún no había lecturas de su edad para esa habilidad) recibe el suyo
   * cuando aparece. Solo mientras siga propuesto y no tenga uno: el cuento del día no cambia a mitad del día.
   */
  sugerir(lectura: LecturaSugerida): boolean {
    if (this.d.estado !== 'PROPUESTO' || this.d.lectura) return false;
    this.d = { ...this.d, lectura };
    return true;
  }

  /** Una respuesta bien hecha. Solo cuenta la de la habilidad del reto, mientras siga propuesto. */
  registrarAcierto(habilidad: string, ahora: Date): 'NADA' | 'AVANZO' | 'COMPLETADO' {
    if (this.d.estado !== 'PROPUESTO' || habilidad !== this.d.habilidad) return 'NADA';
    const avance = Math.min(this.d.avance + 1, this.d.meta);
    const completo = avance >= this.d.meta;
    this.d = { ...this.d, avance, ...(completo ? { estado: 'COMPLETADO' as const, completadoEn: ahora } : {}) };
    return completo ? 'COMPLETADO' : 'AVANZO';
  }
}
