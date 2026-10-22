import { RangoEdad, RANGOS_EDAD } from '../../../shared-kernel/public-api';
import {
  DiagnosticoIncompletoError,
  ItemFueraDeOrdenError,
  RespuestaInvalidaError,
  TransicionDiagnosticoError,
} from '../errors/errores-diagnostico';
import { calcularResultado, ResultadoPorHabilidad } from '../services/calculo-nivel';
import { EstadoDiagnostico, Forma, formaDe, ITEMS_POR_RANGO, TipoDiagnostico } from '../value-objects/plan-diagnostico';
import { ItemDiagnostico } from './item-diagnostico';

export interface RespuestaRegistrada {
  itemId: string;
  indice: number;
  esCorrecta: boolean;
  respondidaEn: Date;
}

export interface ResultadoDiagnostico {
  habilidades: ResultadoPorHabilidad;
  aciertos: number;
  total: number;
}

export interface PropsDiagnostico {
  id: string;
  estudianteId: string;
  tipo: TipoDiagnostico;
  secuencia: number;
  estado: EstadoDiagnostico;
  rangoEdad: RangoEdad;
  totalItems: number;
  asignadoPor: string | null;
  respuestas: RespuestaRegistrada[];
  resultado: ResultadoDiagnostico | null;
  iniciadoEn: Date | null;
  pausadoEn: Date | null;
  finalizadoEn: Date | null;
}

/**
 * Agregado Diagnóstico (RF-034 a RF-037): un intento del reto para un estudiante. Las preguntas se
 * responden en el orden del banco, una vez cada una; así, al reanudar (RF-036), siempre continúa en
 * la siguiente a la última respondida. Al finalizar calcula el nivel por habilidad (RF-035).
 */
export class Diagnostico {
  private constructor(private props: PropsDiagnostico) {}

  static crearInicial(p: { id: string; estudianteId: string; rangoEdad: RangoEdad }): Diagnostico {
    return Diagnostico.nuevo({ ...p, tipo: 'INICIAL', secuencia: 1, asignadoPor: null });
  }

  /** RF-037: el docente asigna una reevaluación con ítems equivalentes. */
  static crearReevaluacion(p: { id: string; estudianteId: string; rangoEdad: RangoEdad; secuencia: number; asignadoPor: string }): Diagnostico {
    if (!Number.isInteger(p.secuencia) || p.secuencia < 1) throw new Error('La secuencia de la reevaluación empieza en 1');
    return Diagnostico.nuevo({ ...p, tipo: 'REEVALUACION' });
  }

  static desdePersistencia(props: PropsDiagnostico): Diagnostico {
    return new Diagnostico({ ...props, respuestas: props.respuestas.map((r) => ({ ...r })) });
  }

  private static nuevo(p: { id: string; estudianteId: string; rangoEdad: RangoEdad; tipo: TipoDiagnostico; secuencia: number; asignadoPor: string | null }) {
    if (!RANGOS_EDAD.includes(p.rangoEdad)) throw new Error('Rango de edad desconocido');
    return new Diagnostico({
      ...p,
      estado: 'NO_INICIADO',
      totalItems: ITEMS_POR_RANGO[p.rangoEdad],
      respuestas: [],
      resultado: null,
      iniciadoEn: null,
      pausadoEn: null,
      finalizadoEn: null,
    });
  }

  get id() { return this.props.id; }
  get estudianteId() { return this.props.estudianteId; }
  get tipo() { return this.props.tipo; }
  get secuencia() { return this.props.secuencia; }
  get estado() { return this.props.estado; }
  get rangoEdad() { return this.props.rangoEdad; }
  get totalItems() { return this.props.totalItems; }
  get resultado() { return this.props.resultado; }
  get respondidos() { return this.props.respuestas.length; }
  get forma(): Forma { return formaDe(this.props.tipo, this.props.secuencia); }

  get snapshot(): Readonly<PropsDiagnostico> {
    return { ...this.props, respuestas: this.props.respuestas.map((r) => ({ ...r })) };
  }

  /** RF-034 y RF-036: empezar o reanudar. Ya en curso, no cambia nada. */
  comenzar(ahora: Date): void {
    if (this.props.estado === 'FINALIZADO') throw new TransicionDiagnosticoError('Este reto ya terminó');
    if (this.props.estado === 'EN_CURSO') return;
    this.props = { ...this.props, estado: 'EN_CURSO', iniciadoEn: this.props.iniciadoEn ?? ahora, pausadoEn: null };
  }

  /** RF-036: el niño puede pausar y volver después; no pierde lo respondido. */
  pausar(ahora: Date): void {
    if (this.props.estado !== 'EN_CURSO') throw new TransicionDiagnosticoError('Solo se puede pausar un reto en curso');
    this.props = { ...this.props, estado: 'PAUSADO', pausadoEn: ahora };
  }

  /** La pregunta que toca: la primera sin responder en el orden del banco (null si ya respondió todas). */
  siguiente(items: readonly ItemDiagnostico[]): ItemDiagnostico | null {
    const respondidas = new Set(this.props.respuestas.map((r) => r.itemId));
    return this.ordenados(items).find((i) => !respondidas.has(i.id)) ?? null;
  }

  responder(items: readonly ItemDiagnostico[], itemId: string, indice: number, ahora: Date): void {
    if (this.props.estado !== 'EN_CURSO') throw new TransicionDiagnosticoError('Primero reanuda tu reto');
    const item = this.siguiente(items);
    if (!item || item.id !== itemId) throw new ItemFueraDeOrdenError();
    if (!Number.isInteger(indice) || indice < 0 || indice >= item.opciones.length) throw new RespuestaInvalidaError();
    this.props.respuestas.push({ itemId, indice, esCorrecta: indice === item.indiceCorrecto, respondidaEn: ahora });
  }

  /** RF-035: con todas las preguntas respondidas, calcula el nivel inicial por habilidad. */
  finalizar(items: readonly ItemDiagnostico[], ahora: Date): ResultadoDiagnostico {
    if (this.props.estado !== 'EN_CURSO') throw new TransicionDiagnosticoError('Primero reanuda tu reto');
    const faltan = this.props.totalItems - this.respondidos;
    if (faltan > 0) throw new DiagnosticoIncompletoError(faltan);
    const porId = new Map(this.ordenados(items).map((i) => [i.id, i]));
    const calificadas = this.props.respuestas.map((r) => {
      const item = porId.get(r.itemId);
      if (!item) throw new Error('Una respuesta no corresponde a ningún ítem del banco');
      return { habilidad: item.habilidad, nivelDificultad: item.nivelDificultad, esCorrecta: r.esCorrecta };
    });
    const resultado: ResultadoDiagnostico = {
      habilidades: calcularResultado(calificadas),
      aciertos: calificadas.filter((c) => c.esCorrecta).length,
      total: calificadas.length,
    };
    this.props = { ...this.props, estado: 'FINALIZADO', resultado, finalizadoEn: ahora, pausadoEn: null };
    return resultado;
  }

  /** Solo los ítems de su edad y forma, en orden; el banco debe tener exactamente los que pide el plan. */
  private ordenados(items: readonly ItemDiagnostico[]): ItemDiagnostico[] {
    const suyos = items.filter((i) => i.rangoEdad === this.props.rangoEdad && i.forma === this.forma).sort((a, b) => a.orden - b.orden);
    if (suyos.length !== this.props.totalItems) {
      throw new Error(`El banco del diagnóstico (${this.props.rangoEdad}, forma ${this.forma}) tiene ${suyos.length} ítems y se esperan ${this.props.totalItems}`);
    }
    return suyos;
  }
}
