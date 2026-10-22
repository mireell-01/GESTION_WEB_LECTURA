import {
  Habilidad,
  HABILIDADES,
  Maestrias,
  NivelCNEB,
  nivelDeclarado,
} from '../../../shared-kernel/public-api';
import { aReforzar, puntajeObservado, siguienteMaestria } from '../services/maestria';

export type OrigenCambio = 'DIAGNOSTICO' | 'ITEM' | 'VALORACION';

export interface MaestriaDeHabilidad {
  habilidad: Habilidad;
  valor: number;
  itemsContados: number;
  actualizadoEn: Date | null;
  /** Bloqueo optimista (SRS §7): cada guardado la incrementa. */
  version: number;
}

/** Un cambio de maestría, para el historial y los eventos. */
export interface CambioMaestria {
  habilidad: Habilidad;
  anterior: number;
  nuevo: number;
  itemsContados: number;
  /** RN-08: nivel declarado antes y después (null: "Aún descubriendo"). */
  nivelAnterior: NivelCNEB | null;
  nivelNuevo: NivelCNEB | null;
  origen: OrigenCambio;
  origenId: string | null;
  registradoEn: Date;
}

const ORDEN_NIVEL: NivelCNEB[] = ['C', 'B', 'A', 'AD'];

/** RN-11: el nivel CNEB declarado subió (de un nivel a otro mayor; declararse por primera vez no cuenta). */
export function nivelSubio(c: CambioMaestria): boolean {
  return (
    c.nivelAnterior !== null &&
    c.nivelNuevo !== null &&
    ORDEN_NIVEL.indexOf(c.nivelNuevo) > ORDEN_NIVEL.indexOf(c.nivelAnterior)
  );
}

/**
 * Agregado: PerfilLector (RF-052 a RF-054). Exactamente 5 maestrías (una por habilidad), cada una en
 * [0, 100]. Parte del reto inicial (Módulo 5) y cambia con cada ítem que el niño cierra en sus
 * lecturas (RN-07) o con la valoración docente de sus respuestas abiertas (RN-19).
 */
export class PerfilLector {
  private pendientes: CambioMaestria[] = [];

  private constructor(
    readonly estudianteId: string,
    private readonly maestrias: Map<Habilidad, MaestriaDeHabilidad>,
    private persistido: boolean,
  ) {}

  static nuevo(estudianteId: string): PerfilLector {
    return new PerfilLector(
      estudianteId,
      new Map(
        HABILIDADES.map((h) => [
          h,
          { habilidad: h, valor: 0, itemsContados: 0, actualizadoEn: null, version: 0 },
        ]),
      ),
      false,
    );
  }

  static desdePersistencia(estudianteId: string, filas: MaestriaDeHabilidad[]): PerfilLector {
    const perfil = PerfilLector.nuevo(estudianteId);
    for (const f of filas) perfil.maestrias.set(f.habilidad, { ...f });
    perfil.persistido = true;
    return perfil;
  }

  get estaPersistido(): boolean {
    return this.persistido;
  }

  /** Ya tiene algo medido (del reto inicial o de sus lecturas). */
  get tieneHistoria(): boolean {
    return [...this.maestrias.values()].some((m) => m.itemsContados > 0);
  }

  de(habilidad: Habilidad): MaestriaDeHabilidad {
    return this.maestrias.get(habilidad) as MaestriaDeHabilidad;
  }

  todas(): MaestriaDeHabilidad[] {
    return HABILIDADES.map((h) => this.de(h));
  }

  valores(): Maestrias {
    return Object.fromEntries(HABILIDADES.map((h) => [h, this.de(h).valor])) as Maestrias;
  }

  promedio(): number {
    return this.todas().reduce((s, m) => s + m.valor, 0) / HABILIDADES.length;
  }

  /** RF-054: las habilidades a reforzar. */
  aReforzar(): Habilidad[] {
    return this.todas()
      .filter((m) => aReforzar(m.valor, m.itemsContados))
      .map((m) => m.habilidad);
  }

  /** RN-20: la habilidad más débil (la de menor maestría; a igualdad, la menos practicada). */
  habilidadMasDebil(): Habilidad {
    return [...this.todas()].sort(
      (a, b) =>
        a.valor - b.valor ||
        a.itemsContados - b.itemsContados ||
        HABILIDADES.indexOf(a.habilidad) - HABILIDADES.indexOf(b.habilidad),
    )[0]!.habilidad;
  }

  /** SAD §6: DiagnosticoFinalizado inicializa el perfil con el nivel inicial por habilidad (RF-035). Solo si aún no tiene historia. */
  iniciarConDiagnostico(p: {
    maestrias: Maestrias;
    items: Partial<Record<Habilidad, number>>;
    diagnosticoId: string | null;
    ahora: Date;
  }): boolean {
    if (this.tieneHistoria) return false;
    for (const h of HABILIDADES) {
      const valor = Math.round(Math.min(100, Math.max(0, p.maestrias[h] ?? 0)) * 100) / 100;
      const items = Math.max(0, Math.trunc(p.items[h] ?? 0));
      this.aplicar(h, valor, items, 'DIAGNOSTICO', p.diagnosticoId, p.ahora);
    }
    return true;
  }

  /** RF-053, RN-07: un ítem cerrado (o una respuesta abierta valorada) mueve la maestría de su habilidad. */
  registrar(p: {
    habilidad: Habilidad;
    puntajeItem: number;
    nivelDificultad: number;
    origen: OrigenCambio;
    origenId: string;
    ahora: Date;
  }): CambioMaestria {
    const actual = this.de(p.habilidad);
    const nuevo = siguienteMaestria(
      actual.valor,
      actual.itemsContados,
      puntajeObservado(p.puntajeItem, p.nivelDificultad),
    );
    return this.aplicar(
      p.habilidad,
      nuevo,
      actual.itemsContados + 1,
      p.origen,
      p.origenId,
      p.ahora,
    );
  }

  /** Para el repositorio: los cambios desde que se cargó. */
  cambios(): readonly CambioMaestria[] {
    return this.pendientes;
  }

  /** Las habilidades que cambiaron: el repositorio sube su versión una vez por guardado. */
  habilidadesCambiadas(): Habilidad[] {
    return [...new Set(this.pendientes.map((c) => c.habilidad))];
  }

  confirmarCambios(): void {
    for (const h of this.habilidadesCambiadas()) this.de(h).version += 1;
    this.pendientes = [];
    this.persistido = true;
  }

  private aplicar(
    h: Habilidad,
    valor: number,
    items: number,
    origen: OrigenCambio,
    origenId: string | null,
    ahora: Date,
  ): CambioMaestria {
    const actual = this.de(h);
    const cambio: CambioMaestria = {
      habilidad: h,
      anterior: actual.valor,
      nuevo: valor,
      itemsContados: items,
      nivelAnterior: nivelDeclarado(actual.valor, actual.itemsContados),
      nivelNuevo: nivelDeclarado(valor, items),
      origen,
      origenId,
      registradoEn: ahora,
    };
    this.maestrias.set(h, { ...actual, valor, itemsContados: items, actualizadoEn: ahora });
    this.pendientes.push(cambio);
    return cambio;
  }
}
