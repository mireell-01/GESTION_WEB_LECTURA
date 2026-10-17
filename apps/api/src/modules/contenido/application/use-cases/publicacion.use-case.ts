import { BusEventos, crearEvento, NoEncontradoError, ProhibidoError } from '../../../shared-kernel/public-api';
import { TransicionInvalidaError } from '../../domain/errors/errores-contenido';
import { EVENTOS_CONTENIDO } from '../../domain/events/eventos-contenido';
import { DetalleBackoffice, Reloj, ResumenBackofficeVista } from '../dto/contenido.dto';
import { LecturaRepository } from '../ports/lectura.repository';
import { Actor, detalleDeTrabajo, versionDeTrabajo } from '../services/versiones';

/**
 * Flujo de publicación (RF-026, RF-027, RN-14, RN-15): el editor envía a revisión, otra persona la
 * aprueba o la devuelve con un motivo, y una publicada puede archivarse. Cada paso es un evento
 * que Administración guarda en la auditoría.
 */
export class PublicacionUseCase {
  constructor(
    private readonly repo: LecturaRepository,
    private readonly bus: BusEventos,
    private readonly ahora: Reloj,
  ) {}

  async enviarARevision(entrada: { editorId: string; lecturaId: string }): Promise<DetalleBackoffice> {
    const ahora = this.ahora();
    const { version } = await versionDeTrabajo(this.repo, entrada.lecturaId);
    version.enviarARevision(entrada.editorId, ahora);
    await this.repo.guardarVersion(version);
    await this.evento(EVENTOS_CONTENIDO.ENVIADA_A_REVISION, entrada.lecturaId, entrada.editorId, version.id, ahora);
    return detalleDeTrabajo(this.repo, entrada.lecturaId, { id: entrada.editorId, rol: 'EDITOR' });
  }

  /** RF-027: al publicar una versión nueva, la anterior se archiva y queda para las sesiones ya hechas. */
  async aprobar(entrada: { revisorId: string; lecturaId: string }): Promise<DetalleBackoffice> {
    const ahora = this.ahora();
    const { lectura, version } = await versionDeTrabajo(this.repo, entrada.lecturaId);
    version.aprobar(entrada.revisorId, ahora);
    const anteriorId = lectura.publicar(version.id);
    const anterior = anteriorId && anteriorId !== version.id ? await this.repo.buscarVersion(anteriorId) : null;
    if (anterior?.estado === 'PUBLICADO') {
      anterior.archivar(ahora);
      await this.repo.guardarVersion(anterior);
    }
    await this.repo.guardarVersion(version);
    await this.repo.guardarLectura(lectura);
    await this.evento(EVENTOS_CONTENIDO.VERSION_PUBLICADA, lectura.id, entrada.revisorId, version.id, ahora, {
      numero: version.propsSnapshot.numero,
      reemplazaA: anterior?.id ?? null,
    });
    return detalleDeTrabajo(this.repo, lectura.id, { id: entrada.revisorId, rol: 'REVISOR' });
  }

  async rechazar(entrada: { revisorId: string; lecturaId: string; comentario: string }): Promise<DetalleBackoffice> {
    const ahora = this.ahora();
    const { version } = await versionDeTrabajo(this.repo, entrada.lecturaId);
    version.rechazar(entrada.revisorId, entrada.comentario);
    await this.repo.guardarVersion(version);
    await this.evento(EVENTOS_CONTENIDO.VERSION_RECHAZADA, entrada.lecturaId, entrada.revisorId, version.id, ahora, {
      motivo: version.propsSnapshot.comentarioRevision,
    });
    return detalleDeTrabajo(this.repo, entrada.lecturaId, { id: entrada.revisorId, rol: 'REVISOR' });
  }

  /** La saca de la biblioteca (y del catálogo de asignaciones); las sesiones hechas no se tocan. */
  async archivar(entrada: { actor: Actor; lecturaId: string }): Promise<DetalleBackoffice> {
    const ahora = this.ahora();
    const lectura = await this.repo.buscarLectura(entrada.lecturaId);
    if (!lectura) throw new NoEncontradoError('Lectura');
    const esAutor = lectura.propsSnapshot.autorId === entrada.actor.id;
    if (entrada.actor.rol !== 'REVISOR' && !(entrada.actor.rol === 'EDITOR' && esAutor)) {
      throw new ProhibidoError('Archivan la lectura su autor o un revisor');
    }
    const publicada = lectura.versionPublicadaId ? await this.repo.buscarVersion(lectura.versionPublicadaId) : null;
    if (!publicada) throw new TransicionInvalidaError('La lectura no tiene una versión publicada');
    publicada.archivar(ahora);
    lectura.archivar(ahora);
    await this.repo.guardarVersion(publicada);
    await this.repo.guardarLectura(lectura);
    await this.evento(EVENTOS_CONTENIDO.LECTURA_ARCHIVADA, lectura.id, entrada.actor.id, publicada.id, ahora, { rol: entrada.actor.rol });
    return detalleDeTrabajo(this.repo, lectura.id, entrada.actor);
  }

  /** Listado del backoffice: el editor ve todas (las suyas primero); el revisor, la cola de revisión primero. */
  async listar(actor: Actor): Promise<ResumenBackofficeVista[]> {
    // Primero lo que espera a esta persona: su cola de revisión o sus borradores.
    const prioridad = (r: ResumenBackofficeVista) =>
      actor.rol === 'REVISOR' ? Number(!(r.estado === 'EN_REVISION' && !r.esAutor)) : Number(!(r.esAutor && r.estado === 'BORRADOR'));
    return (await this.repo.listarResumen())
      .map((r): ResumenBackofficeVista => ({
        lecturaId: r.lecturaId,
        titulo: r.titulo,
        numero: r.numero,
        estado: r.estado,
        rangoEdad: r.rangoEdad,
        nivelDificultad: r.nivelDificultad,
        esAutor: r.autorId === actor.id,
        tienePublicada: r.tienePublicada,
        archivada: r.archivada,
        actualizadaEn: r.actualizadaEn.toISOString(),
      }))
      .sort((a, b) => prioridad(a) - prioridad(b) || b.actualizadaEn.localeCompare(a.actualizadaEn));
  }

  detalle(actor: Actor, lecturaId: string): Promise<DetalleBackoffice> {
    return detalleDeTrabajo(this.repo, lecturaId, actor);
  }

  private async evento(nombre: string, lecturaId: string, actorId: string, versionId: string, ahora: Date, extra: Record<string, unknown> = {}) {
    await this.bus.publicar([crearEvento(nombre, lecturaId, { actorId, versionId, ...extra }, ahora)]);
  }
}
