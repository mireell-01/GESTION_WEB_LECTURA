import { esUuid } from '../../shared-kernel/public-api';
import { URL_RECURSO_BIBLIOTECA } from './dto/contenido.dto';
import { LecturaRepository } from './ports/lectura.repository';

/**
 * Una versión publicada tal como se lee (Módulo 6): texto por oraciones, actividades con sus claves,
 * pistas y explicaciones, y la historia ramificada. Incluye las respuestas correctas: es para corregir
 * en el servidor; quien la usa no debe enviarlas al navegador.
 */
export interface VersionParaLeer {
  lecturaId: string;
  versionId: string;
  titulo: string;
  rangoEdad: string;
  nivelDificultad: number;
  imagen: { url: string; textoAlternativo: string } | null;
  oraciones: { id: string; orden: number; parrafo: number; texto: string }[];
  actividades: {
    id: string;
    momento: string;
    tipo: string;
    orden: number;
    oracionAnclajeId: string | null;
    items: {
      id: string;
      orden: number;
      habilidad: string;
      nivelDificultad: number;
      modalidad: string;
      esCerrado: boolean;
      enunciado: string;
      contenido: { opciones?: string[]; elementos?: string[]; minPalabras?: number; multiple?: boolean };
      respuestaCorrecta: { indice: number } | { indices: number[] } | { orden: number[] } | null;
      explicacionModelada: string;
      pistas: { nivel: string; texto: string }[];
      clavesEvidencia: string[];
    }[];
  }[];
  nodos: { id: string; clave: string; contenido: string; esInicio: boolean; esFinal: boolean; opciones: { texto: string; destino: string }[] }[];
}

/** Fachada pública de Contenido para otros módulos (Lectura interactiva). */
export class ContenidoFacade {
  constructor(private readonly repo: LecturaRepository) {}

  /** La versión publicada vigente de una lectura no archivada (null si no hay). */
  async versionPublicadaId(lecturaId: string): Promise<string | null> {
    if (!esUuid(lecturaId)) return null;
    const lectura = await this.repo.buscarLectura(lecturaId);
    return lectura && !lectura.archivada ? lectura.versionPublicadaId : null;
  }

  /**
   * Una versión que fue publicada (RN-14: ya no cambia). Las sesiones en curso siguen con su versión
   * aunque luego se publique otra o se archive la lectura (RF-027).
   */
  async versionParaLeer(versionId: string): Promise<VersionParaLeer | null> {
    if (!esUuid(versionId)) return null;
    const version = await this.repo.buscarVersion(versionId);
    const p = version?.propsSnapshot;
    if (!p || !p.publicadaEn || (p.estado !== 'PUBLICADO' && p.estado !== 'ARCHIVADO')) return null;
    const imagen = p.recursos.find((r) => r.tipo === 'IMAGEN');
    return {
      lecturaId: p.lecturaId,
      versionId: p.id,
      titulo: p.metadatos.titulo,
      rangoEdad: p.metadatos.rangoEdad,
      nivelDificultad: p.metadatos.nivelDificultad,
      imagen: imagen ? { url: URL_RECURSO_BIBLIOTECA(imagen.id), textoAlternativo: imagen.textoAlternativo ?? '' } : null,
      oraciones: p.oraciones.map((o) => ({ ...o })),
      actividades: p.actividades.map((a) => ({
        id: a.id,
        momento: a.momento,
        tipo: a.tipo,
        orden: a.orden,
        oracionAnclajeId: a.oracionAnclajeId,
        items: a.items.map((i) => ({
          id: i.id,
          orden: i.orden,
          habilidad: i.habilidad,
          nivelDificultad: i.nivelDificultad,
          modalidad: i.modalidad,
          esCerrado: i.esCerrado,
          enunciado: i.enunciado,
          contenido: { ...i.contenido },
          respuestaCorrecta: i.respuestaCorrecta,
          explicacionModelada: i.explicacionModelada,
          pistas: i.pistas.map((x) => ({ ...x })),
          clavesEvidencia: [...i.clavesEvidencia],
        })),
      })),
      nodos: p.nodos.map((n) => ({ ...n, opciones: n.opciones.map((o) => ({ ...o })) })),
    };
  }
}
