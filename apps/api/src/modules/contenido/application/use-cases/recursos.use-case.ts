import { BusEventos, crearEvento, NoEncontradoError } from '../../../shared-kernel/public-api';
import { RecursoInvalidoError, TransicionInvalidaError } from '../../domain/errors/errores-contenido';
import { EVENTOS_CONTENIDO } from '../../domain/events/eventos-contenido';
import { DeclaracionRecurso, EXTENSION, MAX_RECURSOS, validarArchivo, validarDeclaracion } from '../../domain/services/politica-recursos';
import { DetalleBackoffice, GeneradorId, RecursoVista, Reloj, URL_RECURSO_BACKOFFICE, vistaRecurso } from '../dto/contenido.dto';
import { AlmacenArchivos, FirmadorSubidas } from '../ports/almacen';
import { LecturaRepository } from '../ports/lectura.repository';
import { detalleDeTrabajo, versionDeTrabajo } from '../services/versiones';

/** La URL de subida vale 10 minutos, como una URL prefirmada de S3. */
export const VIGENCIA_SUBIDA_MS = 10 * 60 * 1000;

interface Subida {
  recursoId: string;
  versionId: string;
  lecturaId: string;
  editorId: string;
  tipo: 'IMAGEN' | 'AUDIO';
  tipoMime: string;
  bytes: number;
  textoAlternativo: string | null;
  duracionSeg: number | null;
}

/**
 * Imágenes y audio de una lectura (RF-023). Subida en dos pasos, como con S3: el editor declara el
 * archivo y recibe una URL firmada; al llegar el archivo se comprueba que sea exactamente lo
 * declarado (formato real por su firma, tamaño y límites) antes de guardarlo.
 */
export class RecursosUseCase {
  constructor(
    private readonly repo: LecturaRepository,
    private readonly almacen: AlmacenArchivos,
    private readonly firmador: FirmadorSubidas,
    private readonly bus: BusEventos,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async solicitarSubida(entrada: { editorId: string; lecturaId: string } & DeclaracionRecurso): Promise<{ recursoId: string; url: string; expiraEn: string }> {
    const ahora = this.ahora();
    const { version } = await versionDeTrabajo(this.repo, entrada.lecturaId);
    version.asegurarEditablePor(entrada.editorId);
    if (version.propsSnapshot.recursos.length >= MAX_RECURSOS) throw new RecursoInvalidoError(`Una lectura admite hasta ${MAX_RECURSOS} archivos`);
    const declarado = validarDeclaracion(entrada);
    const subida: Subida = {
      recursoId: this.generarId(),
      versionId: version.id,
      lecturaId: entrada.lecturaId,
      editorId: entrada.editorId,
      tipo: declarado.tipo,
      tipoMime: entrada.tipoMime,
      bytes: entrada.bytes,
      textoAlternativo: declarado.textoAlternativo,
      duracionSeg: declarado.duracionSeg,
    };
    const expiraEn = new Date(ahora.getTime() + VIGENCIA_SUBIDA_MS);
    const token = this.firmador.firmar({ ...subida }, expiraEn);
    return { recursoId: subida.recursoId, url: `${URL_RECURSO_BACKOFFICE(subida.recursoId)}?token=${encodeURIComponent(token)}`, expiraEn: expiraEn.toISOString() };
  }

  async recibirArchivo(entrada: { editorId: string; recursoId: string; token: string; archivo: Uint8Array }): Promise<RecursoVista> {
    const ahora = this.ahora();
    const subida = this.firmador.verificar(entrada.token, ahora) as Subida | null;
    if (!subida || subida.recursoId !== entrada.recursoId || subida.editorId !== entrada.editorId) {
      throw new RecursoInvalidoError('El enlace de subida no es válido o ya venció; vuelve a elegir el archivo');
    }
    const version = await this.repo.buscarVersion(subida.versionId);
    if (!version) throw new NoEncontradoError('Lectura');
    version.asegurarEditablePor(entrada.editorId);
    if (version.propsSnapshot.recursos.some((r) => r.id === subida.recursoId)) throw new TransicionInvalidaError('Ese archivo ya se subió');
    validarArchivo(entrada.archivo, subida);

    const claveAlmacen = `lecturas/${subida.lecturaId}/${subida.recursoId}.${EXTENSION[subida.tipoMime]}`;
    await this.almacen.guardar(claveAlmacen, entrada.archivo, subida.tipoMime);
    const recurso = {
      id: subida.recursoId,
      tipo: subida.tipo,
      claveAlmacen,
      tipoMime: subida.tipoMime,
      bytes: subida.bytes,
      textoAlternativo: subida.textoAlternativo,
      duracionSeg: subida.duracionSeg,
      creadoEn: ahora,
    };
    version.agregarRecurso(recurso);
    await this.repo.guardarVersion(version);
    await this.bus.publicar([
      crearEvento(EVENTOS_CONTENIDO.RECURSO_ADJUNTO, subida.lecturaId, { actorId: entrada.editorId, recursoId: recurso.id, tipo: recurso.tipo, bytes: recurso.bytes }, ahora),
    ]);
    return vistaRecurso(recurso, URL_RECURSO_BACKOFFICE);
  }

  async quitar(entrada: { editorId: string; lecturaId: string; recursoId: string }): Promise<DetalleBackoffice> {
    const { version } = await versionDeTrabajo(this.repo, entrada.lecturaId);
    version.asegurarEditablePor(entrada.editorId);
    version.quitarRecurso(entrada.recursoId);
    await this.repo.guardarVersion(version);
    return detalleDeTrabajo(this.repo, entrada.lecturaId, { id: entrada.editorId, rol: 'EDITOR' });
  }

  /** Backoffice: cualquier recurso. Biblioteca: solo los de versiones publicadas. */
  async archivo(recursoId: string, soloPublicados: boolean): Promise<{ datos: Buffer; tipoMime: string }> {
    const encontrado = await this.repo.buscarRecurso(recursoId);
    if (!encontrado || (soloPublicados && encontrado.estado !== 'PUBLICADO')) throw new NoEncontradoError('Archivo');
    const datos = await this.almacen.leer(encontrado.recurso.claveAlmacen);
    if (!datos) throw new NoEncontradoError('Archivo');
    return { datos, tipoMime: encontrado.recurso.tipoMime };
  }
}
