import { BusEventos, crearEvento } from '../../../shared-kernel/public-api';
import { Lectura } from '../../domain/entities/lectura';
import { VersionLectura } from '../../domain/entities/version-lectura';
import { TransicionInvalidaError } from '../../domain/errors/errores-contenido';
import { EVENTOS_CONTENIDO } from '../../domain/events/eventos-contenido';
import { ActividadNueva } from '../../domain/services/actividades';
import { NodoNuevo } from '../../domain/services/grafo-historia';
import { DatosMetadatos, MetadatosLectura } from '../../domain/value-objects/metadatos-lectura';
import { DetalleBackoffice, GeneradorId, Reloj } from '../dto/contenido.dto';
import { LecturaRepository } from '../ports/lectura.repository';
import { detalleDeTrabajo, versionDeTrabajo } from '../services/versiones';

/**
 * Casos de uso de autoría del editor (RF-021, RF-022, RF-024, RF-025, RF-027, RF-029): crear la
 * lectura, editar su borrador (texto, oraciones, actividades, historia) y abrir una versión nueva.
 */
export class AutoriaUseCase {
  constructor(
    private readonly repo: LecturaRepository,
    private readonly bus: BusEventos,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  /** RF-021: la lectura nace como versión 1 en borrador, ya segmentada en oraciones. */
  async crear(entrada: { editorId: string; metadatos: DatosMetadatos; texto: string }): Promise<DetalleBackoffice> {
    const ahora = this.ahora();
    const metadatos = MetadatosLectura.de(entrada.metadatos);
    const lectura = Lectura.crear({ id: this.generarId(), autorId: entrada.editorId, ahora });
    const version = VersionLectura.crearBorrador({
      id: this.generarId(), lecturaId: lectura.id, numero: 1, metadatos, texto: entrada.texto, autorId: entrada.editorId, ahora,
      generarId: this.generarId,
    });
    await this.repo.guardarLectura(lectura);
    await this.repo.guardarVersion(version);
    await this.bus.publicar([crearEvento(EVENTOS_CONTENIDO.LECTURA_CREADA, lectura.id, { actorId: entrada.editorId, versionId: version.id }, ahora)]);
    return detalleDeTrabajo(this.repo, lectura.id, { id: entrada.editorId, rol: 'EDITOR' });
  }

  /** RF-021, RF-022: metadatos y texto; las oraciones que no cambian conservan su id. */
  async actualizarBorrador(entrada: {
    editorId: string;
    lecturaId: string;
    metadatos?: DatosMetadatos;
    texto?: string;
  }): Promise<{ detalle: DetalleBackoffice; ajustes: string[] }> {
    const ajustes: string[] = [];
    const detalle = await this.editar(entrada.editorId, entrada.lecturaId, (v) => {
      ajustes.push(...v.actualizar({ metadatos: entrada.metadatos ? MetadatosLectura.de(entrada.metadatos) : undefined, texto: entrada.texto }, this.generarId));
    });
    return { detalle, ajustes };
  }

  unirOraciones(entrada: { editorId: string; lecturaId: string; oracionId: string }): Promise<DetalleBackoffice> {
    return this.editar(entrada.editorId, entrada.lecturaId, (v) => v.unirOraciones(entrada.oracionId));
  }

  dividirOracion(entrada: { editorId: string; lecturaId: string; oracionId: string; posicion: number }): Promise<DetalleBackoffice> {
    return this.editar(entrada.editorId, entrada.lecturaId, (v) => v.dividirOracion(entrada.oracionId, entrada.posicion, this.generarId));
  }

  /** RF-024, RF-025 */
  reemplazarActividades(entrada: { editorId: string; lecturaId: string; actividades: ActividadNueva[] }): Promise<DetalleBackoffice> {
    return this.editar(entrada.editorId, entrada.lecturaId, (v) => v.reemplazarActividades(entrada.actividades, this.generarId));
  }

  /** RF-029 */
  reemplazarGrafo(entrada: { editorId: string; lecturaId: string; nodos: NodoNuevo[] }): Promise<DetalleBackoffice> {
    return this.editar(entrada.editorId, entrada.lecturaId, (v) => v.reemplazarGrafo(entrada.nodos, this.generarId));
  }

  /**
   * RF-027: editar una lectura publicada abre una versión nueva en borrador; la publicada sigue
   * en la biblioteca hasta que la nueva se apruebe.
   */
  async nuevaVersion(entrada: { editorId: string; lecturaId: string }): Promise<DetalleBackoffice> {
    const ahora = this.ahora();
    const { lectura, version } = await versionDeTrabajo(this.repo, entrada.lecturaId);
    if (version.estado !== 'PUBLICADO' || version.id !== lectura.versionPublicadaId) {
      throw new TransicionInvalidaError('Ya hay una versión en borrador o en revisión, o la lectura no está publicada');
    }
    const numero = Math.max(...(await this.repo.versionesDe(lectura.id)).map((v) => v.propsSnapshot.numero)) + 1;
    const nueva = VersionLectura.nuevaDesde(version, { id: this.generarId(), numero, autorId: entrada.editorId, ahora, generarId: this.generarId });
    await this.repo.guardarVersion(nueva);
    await this.bus.publicar([
      crearEvento(EVENTOS_CONTENIDO.VERSION_CREADA, lectura.id, { actorId: entrada.editorId, versionId: nueva.id, numero }, ahora),
    ]);
    return detalleDeTrabajo(this.repo, lectura.id, { id: entrada.editorId, rol: 'EDITOR' });
  }

  private async editar(editorId: string, lecturaId: string, cambio: (v: VersionLectura) => void): Promise<DetalleBackoffice> {
    const { version } = await versionDeTrabajo(this.repo, lecturaId);
    version.asegurarEditablePor(editorId);
    cambio(version);
    await this.repo.guardarVersion(version);
    return detalleDeTrabajo(this.repo, lecturaId, { id: editorId, rol: 'EDITOR' });
  }
}
