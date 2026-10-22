/** Tipos de las respuestas de Contenido que usa la web (RF-021 a RF-029) y sus nombres en pantalla. */

export type EstadoVersion = 'BORRADOR' | 'EN_REVISION' | 'PUBLICADO' | 'ARCHIVADO';
export type Momento = 'ANTES' | 'DURANTE' | 'DESPUES';
export type TipoActividad = 'PREDICCION' | 'SELECCION' | 'ESCRITURA' | 'ORDENAMIENTO' | 'EVIDENCIA' | 'DEFIENDE';
export type Modalidad = 'SELECCION' | 'ESCRITURA' | 'ORDENAMIENTO' | 'EVIDENCIA' | 'VOZ';

export interface Metadatos {
  titulo: string;
  rangoEdad: string;
  nivelDificultad: number;
  tematica: string;
  tipoTexto: string;
  habilidadesObjetivo: string[];
  licencia: string | null;
}

export interface Oracion {
  id: string;
  orden: number;
  parrafo: number;
  texto: string;
}

export interface Item {
  id: string;
  orden: number;
  habilidad: string;
  nivelDificultad: number;
  modalidad: Modalidad;
  esCerrado: boolean;
  enunciado: string;
  contenido: { opciones?: string[]; multiple?: boolean; elementos?: string[]; minPalabras?: number };
  respuestaCorrecta: { indice: number } | { indices: number[] } | { orden: number[] } | null;
  explicacionModelada: string;
  pistas: { nivel: 'P1' | 'P2' | 'P3'; texto: string }[];
  clavesEvidencia: string[];
}

export interface Actividad {
  id: string;
  momento: Momento;
  tipo: TipoActividad;
  orden: number;
  oracionAnclajeId: string | null;
  items: Item[];
}

export interface Recurso {
  id: string;
  tipo: 'IMAGEN' | 'AUDIO';
  tipoMime: string;
  bytes: number;
  textoAlternativo: string | null;
  duracionSeg: number | null;
  url: string;
}

export interface Nodo {
  id: string;
  clave: string;
  contenido: string;
  esInicio: boolean;
  esFinal: boolean;
  opciones: { texto: string; destino: string }[];
}

export interface DetalleLectura {
  lecturaId: string;
  versionId: string;
  numero: number;
  estado: EstadoVersion;
  autorId: string;
  esAutor: boolean;
  metadatos: Metadatos;
  texto: string;
  oraciones: Oracion[];
  actividades: Actividad[];
  recursos: Recurso[];
  nodos: Nodo[];
  esRamificada: boolean;
  pesoBytes: number;
  comentarioRevision: string | null;
  problemas: string[];
  permisos: { editar: boolean; enviar: boolean; revisar: boolean; nuevaVersion: boolean; archivar: boolean };
  publicada: { versionId: string; numero: number } | null;
}

export interface ResumenLectura {
  lecturaId: string;
  titulo: string;
  numero: number;
  estado: EstadoVersion;
  rangoEdad: string;
  nivelDificultad: number;
  esAutor: boolean;
  tienePublicada: boolean;
  archivada: boolean;
  actualizadaEn: string;
}

export interface FichaLectura {
  lecturaId: string;
  titulo: string;
  rangoEdad: string;
  nivelDificultad: number;
  tematica: string;
  tipoTexto: string;
  habilidades: string[];
  esRamificada: boolean;
  resumen: string;
  totalActividades: number;
}

export interface DetalleBiblioteca extends FichaLectura {
  licencia: string | null;
  parrafos: { numero: number; oraciones: { id: string; texto: string }[] }[];
  imagenes: { id: string; url: string; textoAlternativo: string }[];
  actividadesPorMomento: Record<Momento, number>;
}

export const EDADES: Record<string, string> = { R1: '6–7 años', R2: '8–9 años', R3: '10–12 años' };

export const TIPOS_TEXTO: Record<string, string> = {
  CUENTO: 'Cuento',
  HISTORIETA: 'Historieta',
  POEMA: 'Poema',
  NOTICIA_INFANTIL: 'Noticia infantil',
  CIENTIFICO: 'Científico',
  INFORMATIVO: 'Informativo',
  ANUNCIO: 'Anuncio',
  INSTRUCTIVO: 'Instructivo',
  COTIDIANO: 'Texto cotidiano',
};

export const HABILIDADES: Record<string, string> = {
  LIT: 'Comprensión literal',
  INF: 'Inferencia',
  VOC: 'Vocabulario',
  CRI: 'Pensamiento crítico',
  ARG: 'Argumentación',
};

export const MOMENTOS: Record<Momento, string> = { ANTES: 'Antes de leer', DURANTE: 'Durante la lectura', DESPUES: 'Después de leer' };

export const TIPOS_ACTIVIDAD: Record<TipoActividad, string> = {
  PREDICCION: 'Predicción',
  SELECCION: 'Selección',
  ESCRITURA: 'Escritura',
  ORDENAMIENTO: 'Ordenamiento',
  EVIDENCIA: 'Encuentra la evidencia',
  DEFIENDE: 'Defiende tu respuesta',
};

export const MODALIDADES: Record<Modalidad, string> = {
  SELECCION: 'Elegir una opción',
  ESCRITURA: 'Escribir',
  ORDENAMIENTO: 'Ordenar',
  EVIDENCIA: 'Marcar oraciones',
  VOZ: 'Responder con la voz',
};

/** Las mismas reglas del dominio: qué formas de responder tiene cada tipo de actividad. */
export const MODALIDADES_POR_TIPO: Record<TipoActividad, Modalidad[]> = {
  PREDICCION: ['ESCRITURA', 'SELECCION', 'VOZ'],
  SELECCION: ['SELECCION'],
  ESCRITURA: ['ESCRITURA', 'VOZ'],
  ORDENAMIENTO: ['ORDENAMIENTO'],
  EVIDENCIA: ['EVIDENCIA'],
  DEFIENDE: ['SELECCION', 'ESCRITURA'],
};

export const ESTADOS: Record<EstadoVersion, { texto: string; tipo?: 'exito' | 'aviso' | 'error' | 'info' }> = {
  BORRADOR: { texto: 'Borrador', tipo: 'aviso' },
  EN_REVISION: { texto: 'En revisión', tipo: 'info' },
  PUBLICADO: { texto: 'Publicada', tipo: 'exito' },
  ARCHIVADO: { texto: 'Archivada' },
};

export const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString('es-PE')} KB`;
