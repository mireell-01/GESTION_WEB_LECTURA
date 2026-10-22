/** Contratos de la lectura interactiva (Módulo 6, RF-038 a RF-051), tal como los entrega la API. */

export type Fase = 'PREDICCION' | 'ANTES' | 'LECTURA' | 'HISTORIA' | 'DESPUES' | 'CIERRE' | 'FINALIZADA' | 'ABANDONADA';
export type Modalidad = 'SELECCION' | 'ESCRITURA' | 'ORDENAMIENTO' | 'EVIDENCIA' | 'VOZ';

export interface Pista {
  nivel: 'P1' | 'P2' | 'P3';
  texto: string;
  /** RN-06: el párrafo que se resalta. */
  parrafo: number | null;
}

export interface Pregunta {
  itemId: string;
  numero: number;
  total: number;
  momento: 'ANTES' | 'DURANTE' | 'DESPUES';
  tipo: string;
  modalidad: Modalidad;
  habilidad: string;
  enunciado: string;
  opciones: string[];
  multiple: boolean;
  elementos: string[];
  minPalabras: number | null;
  maxCaracteres: number;
  anclajeOracionId: string | null;
  pistas: Pista[];
  pistasRestantes: number;
  defiende: { enunciado: string; respuesta: string } | null;
}

export interface Parrafo {
  numero: number;
  oraciones: { id: string; texto: string }[];
}

export interface Sesion {
  id: string;
  lecturaId: string;
  estado: string;
  fase: Fase;
  lectura: { titulo: string; rangoEdad: string; imagen: { url: string; textoAlternativo: string } | null; leerEnVozAlta: boolean };
  prediccion: { enunciado: string; opciones: string[]; respuesta: string | null };
  texto: { parrafos: Parrafo[]; completo: boolean };
  progreso: { hechas: number; total: number };
  pregunta: Pregunta | null;
  historia: { nodo: { id: string; contenido: string; esFinal: boolean; opciones: string[] }; recorrido: { contenido: string; eleccion: string }[] } | null;
  cierre: { prediccion: string; desenlace: string; pregunta: string } | null;
  reflexion: string | null;
  resumen: { preguntas: number; sinAyuda: number; conPista: number; conExplicacion: number; abiertas: number } | null;
  filtrado?: boolean;
}

export interface ResultadoRespuesta {
  respuestaId: string;
  resultado: 'CORRECTA' | 'INCORRECTA' | 'ENVIADA';
  pista: Pista | null;
  explicacion: string | null;
  filtrado: boolean;
  sesion: Sesion;
}

/** Lo que se envía según la forma de responder. */
export type EntradaRespuesta =
  | { indice: number }
  | { indices: number[] }
  | { orden: number[] }
  | { oraciones: string[] }
  | { texto: string; porVoz: boolean };

/** RF-051: una respuesta abierta para la revisión docente. */
export interface RespuestaAbierta {
  respuestaId: string;
  estado: 'PENDIENTE_REVISION' | 'VALORADA';
  estudiante: { id: string; alias: string; avatar: string };
  lectura: { id: string; titulo: string };
  pregunta: { enunciado: string; habilidad: string };
  respuesta: string;
  porVoz: boolean;
  defiende: { enunciado: string; respuesta: string } | null;
  justificacion: string | null;
  respondidaEn: string;
  valoracion: { nivel: number; comentario: string | null } | null;
}

/** Las habilidades en palabras del aula (docente) y en palabras de niño. */
export const HABILIDAD: Record<string, string> = {
  LIT: 'Comprensión literal',
  INF: 'Inferencias',
  VOC: 'Vocabulario',
  CRI: 'Pensamiento crítico',
  ARG: 'Argumentación',
};

/** RF-051: rúbrica de 3 niveles. */
export const RUBRICA = [
  { nivel: 1, nombre: 'En inicio', descripcion: 'No responde a la pregunta o no usa lo que dice el texto.' },
  { nivel: 2, nombre: 'En proceso', descripcion: 'Responde con una idea del texto, pero sin explicar bien por qué.' },
  { nivel: 3, nombre: 'Logrado', descripcion: 'Responde y lo explica con ideas o datos del texto.' },
] as const;

export const LETRAS = ['A', 'B', 'C', 'D', 'E'];
