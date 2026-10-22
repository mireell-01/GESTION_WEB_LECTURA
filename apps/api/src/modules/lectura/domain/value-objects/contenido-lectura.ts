import { Habilidad, RangoEdad } from '../../../shared-kernel/public-api';

/**
 * Lo que una sesión necesita de una versión publicada (RN-14: inmutable). Llega de Contenido por un
 * adaptador anticorrupción; incluye las claves de respuesta, que nunca salen del servidor.
 */
export type Momento = 'ANTES' | 'DURANTE' | 'DESPUES';
export type TipoActividad = 'PREDICCION' | 'SELECCION' | 'ESCRITURA' | 'ORDENAMIENTO' | 'EVIDENCIA' | 'DEFIENDE';
export type Modalidad = 'SELECCION' | 'ESCRITURA' | 'ORDENAMIENTO' | 'EVIDENCIA' | 'VOZ';
export type NivelPista = 'P1' | 'P2' | 'P3';

export interface OracionLectura {
  id: string;
  orden: number;
  parrafo: number;
  texto: string;
}

export interface ItemLectura {
  id: string;
  orden: number;
  habilidad: Habilidad;
  nivelDificultad: number;
  modalidad: Modalidad;
  /** Cerrado: se corrige en el servidor. Abierto (escritura o voz): lo valora la docente (RF-051). */
  esCerrado: boolean;
  enunciado: string;
  /** SELECCION. */
  opciones: string[];
  /** SELECCION: una opción correcta, o varias en selección múltiple (RF-040). */
  indicesCorrectos: number[];
  multiple: boolean;
  /** ORDENAMIENTO: escritos en el orden correcto (al niño se le muestran mezclados). */
  elementos: string[];
  /** ESCRITURA / VOZ. */
  minPalabras: number | null;
  explicacionModelada: string;
  /** P1 → P2 → P3, de 0 a 3 (RF-045, RN-06). */
  pistas: { nivel: NivelPista; texto: string }[];
  /** EVIDENCIA: oraciones que respaldan la respuesta (RF-043). */
  clavesEvidencia: string[];
}

export interface ActividadLectura {
  id: string;
  momento: Momento;
  tipo: TipoActividad;
  orden: number;
  /** DURANTE: la oración donde aparece la pregunta (RF-039). */
  oracionAnclajeId: string | null;
  items: ItemLectura[];
}

/** Nodo de una historia ramificada (RF-048): sus opciones llevan a otro nodo por su clave. */
export interface NodoLectura {
  id: string;
  clave: string;
  contenido: string;
  esInicio: boolean;
  esFinal: boolean;
  opciones: { texto: string; destino: string }[];
}

export interface ContenidoLectura {
  lecturaId: string;
  versionId: string;
  titulo: string;
  rangoEdad: RangoEdad;
  nivelDificultad: number;
  imagen: { url: string; textoAlternativo: string } | null;
  oraciones: OracionLectura[];
  actividades: ActividadLectura[];
  nodos: NodoLectura[];
}
