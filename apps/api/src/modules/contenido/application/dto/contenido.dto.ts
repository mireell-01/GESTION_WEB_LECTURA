import { EstadoVersion, VersionLectura } from '../../domain/entities/version-lectura';
import { Actividad } from '../../domain/services/actividades';
import { NodoHistoria } from '../../domain/services/grafo-historia';
import { Oracion } from '../../domain/services/segmentador';
import { DatosMetadatos } from '../../domain/value-objects/metadatos-lectura';

export type Reloj = () => Date;
export type GeneradorId = () => string;
export type RolBackoffice = 'EDITOR' | 'REVISOR' | 'ADMIN_PLATAFORMA';

export const URL_RECURSO_BACKOFFICE = (id: string) => `/api/v1/backoffice/recursos/${id}/archivo`;
export const URL_RECURSO_BIBLIOTECA = (id: string) => `/api/v1/biblioteca/recursos/${id}`;

export interface RecursoVista {
  id: string;
  tipo: 'IMAGEN' | 'AUDIO';
  tipoMime: string;
  bytes: number;
  textoAlternativo: string | null;
  duracionSeg: number | null;
  url: string;
}

/** Todo lo que el backoffice necesita para editar o revisar una versión (incluye respuestas y pistas). */
export interface DetalleBackoffice {
  lecturaId: string;
  versionId: string;
  numero: number;
  estado: EstadoVersion;
  autorId: string;
  esAutor: boolean;
  metadatos: DatosMetadatos;
  texto: string;
  oraciones: Oracion[];
  actividades: Actividad[];
  recursos: RecursoVista[];
  nodos: NodoHistoria[];
  esRamificada: boolean;
  pesoBytes: number;
  comentarioRevision: string | null;
  /** Lo que aún impide enviarla a revisión o publicarla. */
  problemas: string[];
  permisos: { editar: boolean; enviar: boolean; revisar: boolean; nuevaVersion: boolean; archivar: boolean };
  /** Versión publicada vigente, si existe y no es esta. */
  publicada: { versionId: string; numero: number } | null;
  creadaEn: string;
  enviadaRevisionEn: string | null;
  publicadaEn: string | null;
}

/** Fila del listado del backoffice. */
export interface ResumenBackofficeVista {
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

/** Ficha de la biblioteca (RF-028): sin respuestas ni pistas. */
export interface FichaBiblioteca {
  lecturaId: string;
  versionId: string;
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

export interface DetalleBiblioteca extends FichaBiblioteca {
  licencia: string | null;
  parrafos: { numero: number; oraciones: { id: string; texto: string }[] }[];
  imagenes: { id: string; url: string; textoAlternativo: string }[];
  actividadesPorMomento: { ANTES: number; DURANTE: number; DESPUES: number };
}

export function vistaRecurso(r: VersionLectura['propsSnapshot']['recursos'][number], url: (id: string) => string): RecursoVista {
  return { id: r.id, tipo: r.tipo, tipoMime: r.tipoMime, bytes: r.bytes, textoAlternativo: r.textoAlternativo, duracionSeg: r.duracionSeg, url: url(r.id) };
}

export function fichaDe(v: VersionLectura): FichaBiblioteca {
  const p = v.propsSnapshot;
  const primeras = [...p.oraciones].sort((a, b) => a.orden - b.orden).slice(0, 2).map((o) => o.texto).join(' ');
  return {
    lecturaId: p.lecturaId,
    versionId: p.id,
    titulo: p.metadatos.titulo,
    rangoEdad: p.metadatos.rangoEdad,
    nivelDificultad: p.metadatos.nivelDificultad,
    tematica: p.metadatos.tematica,
    tipoTexto: p.metadatos.tipoTexto,
    habilidades: [...p.metadatos.habilidadesObjetivo],
    esRamificada: v.esRamificada,
    resumen: primeras.length > 180 ? `${primeras.slice(0, 177).trimEnd()}...` : primeras,
    totalActividades: p.actividades.length,
  };
}
