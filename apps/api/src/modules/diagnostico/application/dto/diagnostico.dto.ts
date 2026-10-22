import { ETIQUETA_NIVEL, Habilidad, HABILIDADES, NivelCNEB, NOMBRE_HABILIDAD } from '../../../shared-kernel/public-api';
import { Diagnostico, ResultadoDiagnostico } from '../../domain/entities/diagnostico';
import { ItemDiagnostico } from '../../domain/entities/item-diagnostico';
import { EstadoDiagnostico, TipoDiagnostico } from '../../domain/value-objects/plan-diagnostico';

export interface RetoVista {
  /** null mientras el reto inicial no se haya empezado. */
  id: string | null;
  tipo: TipoDiagnostico;
  estado: EstadoDiagnostico;
  respondidos: number;
  total: number;
}

export interface RetoActualVista {
  inicialFinalizado: boolean;
  /** El reto que el niño tiene que hacer o continuar (null si no tiene ninguno). */
  pendiente: RetoVista | null;
}

/** Una pregunta tal como la ve el niño: sin habilidad ni respuesta correcta. */
export interface ItemVista {
  itemId: string;
  numero: number;
  total: number;
  lectura: { titulo: string; texto: string };
  enunciado: string;
  opciones: string[];
}

export interface RespuestaVista {
  respondidos: number;
  total: number;
  terminado: boolean;
}

export interface HabilidadResultadoVista {
  codigo: Habilidad;
  nombre: string;
  valor: number;
  nivel: NivelCNEB;
  etiquetaNivel: string;
  /** RN-08: nivel "declarado" solo con 5 ítems o más; con menos, "Aún descubriendo". */
  nivelDeclarado: NivelCNEB | null;
}

export interface ResultadoVista {
  diagnosticoId: string;
  tipo: TipoDiagnostico;
  aciertos: number;
  total: number;
  habilidades: HabilidadResultadoVista[];
}

export function vistaReto(d: Diagnostico): RetoVista {
  return { id: d.id, tipo: d.tipo, estado: d.estado, respondidos: d.respondidos, total: d.totalItems };
}

export function vistaItem(item: ItemDiagnostico, d: Diagnostico): ItemVista {
  return {
    itemId: item.id,
    numero: d.respondidos + 1,
    total: d.totalItems,
    lectura: { titulo: item.lectura.titulo, texto: item.lectura.texto },
    enunciado: item.enunciado,
    opciones: [...item.opciones],
  };
}

export function vistaHabilidades(r: ResultadoDiagnostico): HabilidadResultadoVista[] {
  return HABILIDADES.map((h) => {
    const x = r.habilidades[h];
    return { codigo: h, nombre: NOMBRE_HABILIDAD[h], valor: x.valor, nivel: x.nivel, etiquetaNivel: ETIQUETA_NIVEL[x.nivel], nivelDeclarado: x.nivelDeclarado };
  });
}

export function vistaResultado(d: Diagnostico, r: ResultadoDiagnostico): ResultadoVista {
  return { diagnosticoId: d.id, tipo: d.tipo, aciertos: r.aciertos, total: r.total, habilidades: vistaHabilidades(r) };
}

/** RF-037: un estudiante en el panel de reevaluación del docente. */
export interface ReevaluacionEstudianteVista {
  estudianteId: string;
  alias: string;
  avatar: string;
  inicial: { estado: EstadoDiagnostico | 'SIN_EMPEZAR'; valores: Record<Habilidad, number> | null };
  reevaluacion: { secuencia: number; estado: EstadoDiagnostico; respondidos: number; total: number; valores: Record<Habilidad, number> | null } | null;
  /** Diferencia por habilidad entre la última reevaluación terminada y el diagnóstico inicial. */
  cambios: Record<Habilidad, number> | null;
}

export interface AsignacionReevaluacionVista {
  asignados: number;
  omitidos: { estudianteId: string; alias: string; motivo: string }[];
}
