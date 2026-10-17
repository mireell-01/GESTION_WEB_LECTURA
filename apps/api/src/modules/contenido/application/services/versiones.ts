import { NoEncontradoError } from '../../../shared-kernel/public-api';
import { Lectura } from '../../domain/entities/lectura';
import { VersionLectura } from '../../domain/entities/version-lectura';
import { DetalleBackoffice, RolBackoffice, URL_RECURSO_BACKOFFICE, vistaRecurso } from '../dto/contenido.dto';
import { LecturaRepository } from '../ports/lectura.repository';

export interface Actor {
  id: string;
  rol: RolBackoffice;
}

/**
 * La versión "de trabajo" de una lectura: la que está en borrador o en revisión; si no hay, la
 * publicada; si tampoco, la más reciente (archivada).
 */
export async function versionDeTrabajo(repo: LecturaRepository, lecturaId: string): Promise<{ lectura: Lectura; version: VersionLectura }> {
  const lectura = await repo.buscarLectura(lecturaId);
  if (!lectura) throw new NoEncontradoError('Lectura');
  const versiones = (await repo.versionesDe(lectura.id)).sort((a, b) => b.propsSnapshot.numero - a.propsSnapshot.numero);
  const version =
    versiones.find((v) => v.estado === 'BORRADOR' || v.estado === 'EN_REVISION') ??
    versiones.find((v) => v.id === lectura.versionPublicadaId) ??
    versiones[0];
  if (!version) throw new NoEncontradoError('Lectura');
  return { lectura, version };
}

export function detalleBackoffice(lectura: Lectura, version: VersionLectura, actor: Actor, publicada: VersionLectura | null): DetalleBackoffice {
  const p = version.propsSnapshot;
  const esAutor = p.autorId === actor.id;
  const problemas = version.problemasParaRevision();
  const editar = actor.rol === 'EDITOR' && p.estado === 'BORRADOR' && esAutor;
  return {
    lecturaId: lectura.id,
    versionId: p.id,
    numero: p.numero,
    estado: p.estado,
    autorId: p.autorId,
    esAutor,
    metadatos: p.metadatos.datos,
    texto: version.texto,
    oraciones: [...p.oraciones].sort((a, b) => a.orden - b.orden),
    actividades: p.actividades,
    recursos: p.recursos.map((r) => vistaRecurso(r, URL_RECURSO_BACKOFFICE)),
    nodos: p.nodos,
    esRamificada: version.esRamificada,
    pesoBytes: version.pesoBytes,
    comentarioRevision: p.comentarioRevision,
    problemas,
    permisos: {
      editar,
      enviar: editar && problemas.length === 0,
      revisar: actor.rol === 'REVISOR' && p.estado === 'EN_REVISION' && !esAutor,
      nuevaVersion: actor.rol === 'EDITOR' && p.estado === 'PUBLICADO',
      archivar: p.estado === 'PUBLICADO' && (actor.rol === 'REVISOR' || (actor.rol === 'EDITOR' && lectura.propsSnapshot.autorId === actor.id)),
    },
    publicada: publicada && publicada.id !== p.id ? { versionId: publicada.id, numero: publicada.propsSnapshot.numero } : null,
    creadaEn: p.creadaEn.toISOString(),
    enviadaRevisionEn: p.enviadaRevisionEn?.toISOString() ?? null,
    publicadaEn: p.publicadaEn?.toISOString() ?? null,
  };
}

/** Detalle de la versión de trabajo, con la publicada vigente como referencia. */
export async function detalleDeTrabajo(repo: LecturaRepository, lecturaId: string, actor: Actor): Promise<DetalleBackoffice> {
  const { lectura, version } = await versionDeTrabajo(repo, lecturaId);
  const publicada = lectura.versionPublicadaId && lectura.versionPublicadaId !== version.id ? await repo.buscarVersion(lectura.versionPublicadaId) : null;
  return detalleBackoffice(lectura, version, actor, publicada);
}
