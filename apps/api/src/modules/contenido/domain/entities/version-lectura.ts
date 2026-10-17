import {
  AutorNoPuedeAprobarError,
  DatoLecturaInvalidoError,
  LecturaIncompletaError,
  NoEsAutorError,
  TransicionInvalidaError,
  VersionNoEditableError,
} from '../errors/errores-contenido';
import { Actividad, ActividadNueva, construirActividades, problemasDeActividades } from '../services/actividades';
import { construirGrafo, NodoHistoria, NodoNuevo, problemasDelGrafo } from '../services/grafo-historia';
import { dividir, Oracion, segmentar, textoDe, unirConSiguiente } from '../services/segmentador';
import { MetadatosLectura } from '../value-objects/metadatos-lectura';

export type EstadoVersion = 'BORRADOR' | 'EN_REVISION' | 'PUBLICADO' | 'ARCHIVADO';
export type TipoRecurso = 'IMAGEN' | 'AUDIO';

/** RNF-006: peso total de una lectura (texto + imágenes + audio) < 1,5 MB. */
export const PESO_MAXIMO_LECTURA = 1.5 * 1024 * 1024;

/** Imagen (AVIF/WebP ≤ 200 KB, con texto alternativo) o audio (≤ 2 MB) de una versión (RF-023). */
export interface Recurso {
  id: string;
  tipo: TipoRecurso;
  claveAlmacen: string;
  tipoMime: string;
  bytes: number;
  textoAlternativo: string | null;
  duracionSeg: number | null;
  creadoEn: Date;
}

export interface VersionLecturaProps {
  id: string;
  lecturaId: string;
  numero: number;
  estado: EstadoVersion;
  metadatos: MetadatosLectura;
  autorId: string;
  revisorId: string | null;
  oraciones: Oracion[];
  actividades: Actividad[];
  recursos: Recurso[];
  nodos: NodoHistoria[];
  comentarioRevision: string | null;
  creadaEn: Date;
  enviadaRevisionEn: Date | null;
  publicadaEn: Date | null;
  archivadaEn: Date | null;
}

/**
 * Agregado: VersionLectura (RF-021 a RF-027, RF-029). Es la unidad que se escribe, se revisa y se
 * publica: BORRADOR → EN_REVISION → PUBLICADO → ARCHIVADO, con EN_REVISION → BORRADOR por rechazo.
 * Publicada es inmutable (RN-14): editarla crea una versión nueva y las sesiones de lectura siguen
 * apuntando a la anterior (RF-027).
 */
export class VersionLectura {
  private constructor(private readonly props: VersionLecturaProps) {}

  static crearBorrador(params: {
    id: string;
    lecturaId: string;
    numero: number;
    metadatos: MetadatosLectura;
    texto: string;
    autorId: string;
    ahora: Date;
    generarId: () => string;
  }): VersionLectura {
    return new VersionLectura({
      id: params.id,
      lecturaId: params.lecturaId,
      numero: params.numero,
      estado: 'BORRADOR',
      metadatos: params.metadatos,
      autorId: params.autorId,
      revisorId: null,
      oraciones: segmentar(params.texto, [], params.generarId),
      actividades: [],
      recursos: [],
      nodos: [],
      comentarioRevision: null,
      creadaEn: params.ahora,
      enviadaRevisionEn: null,
      publicadaEn: null,
      archivadaEn: null,
    });
  }

  static desdePersistencia(props: VersionLecturaProps): VersionLectura {
    return new VersionLectura(props);
  }

  /**
   * RF-027: borrador nuevo copiado de la versión publicada, con ids propios (los de la publicada
   * no cambian: las sesiones ya hechas siguen apuntando a ellos). Anclajes y evidencias se remapean.
   */
  static nuevaDesde(publicada: VersionLectura, params: { id: string; numero: number; autorId: string; ahora: Date; generarId: () => string }): VersionLectura {
    if (publicada.estado !== 'PUBLICADO') throw new TransicionInvalidaError('Solo se crea una versión nueva desde la publicada');
    const p = publicada.props;
    const idOracion = new Map(p.oraciones.map((o) => [o.id, params.generarId()]));
    const nuevoId = (id: string) => idOracion.get(id) as string;
    return new VersionLectura({
      ...p,
      id: params.id,
      numero: params.numero,
      estado: 'BORRADOR',
      autorId: params.autorId,
      revisorId: null,
      oraciones: p.oraciones.map((o) => ({ ...o, id: nuevoId(o.id) })),
      actividades: p.actividades.map((a) => ({
        ...a,
        id: params.generarId(),
        oracionAnclajeId: a.oracionAnclajeId ? nuevoId(a.oracionAnclajeId) : null,
        items: a.items.map((it) => ({
          ...it,
          id: params.generarId(),
          pistas: it.pistas.map((x) => ({ ...x })),
          clavesEvidencia: it.clavesEvidencia.map(nuevoId),
        })),
      })),
      // El archivo es inmutable: la versión nueva reutiliza el mismo objeto del almacén.
      recursos: p.recursos.map((r) => ({ ...r, id: params.generarId() })),
      nodos: p.nodos.map((n) => ({ ...n, id: params.generarId(), opciones: n.opciones.map((o) => ({ ...o })) })),
      comentarioRevision: null,
      creadaEn: params.ahora,
      enviadaRevisionEn: null,
      publicadaEn: null,
      archivadaEn: null,
    });
  }

  get id(): string {
    return this.props.id;
  }

  get lecturaId(): string {
    return this.props.lecturaId;
  }

  get estado(): EstadoVersion {
    return this.props.estado;
  }

  get autorId(): string {
    return this.props.autorId;
  }

  get texto(): string {
    return textoDe(this.props.oraciones);
  }

  get esRamificada(): boolean {
    return this.props.nodos.length > 0;
  }

  get pesoBytes(): number {
    return new TextEncoder().encode(this.texto).length + this.props.recursos.reduce((s, r) => s + r.bytes, 0);
  }

  get propsSnapshot(): Readonly<VersionLecturaProps> {
    return this.props;
  }

  /** Solo su autor edita un borrador; en revisión, publicada o archivada no se toca (RN-14). */
  asegurarEditablePor(actorId: string): void {
    if (this.props.estado !== 'BORRADOR') throw new VersionNoEditableError();
    if (this.props.autorId !== actorId) throw new NoEsAutorError();
  }

  /**
   * RF-021, RF-022: cambia metadatos y/o texto. Las oraciones que siguen igual conservan su id;
   * si desaparece una oración anclada o usada como evidencia, se ajusta y se avisa.
   */
  actualizar(cambios: { metadatos?: MetadatosLectura; texto?: string }, generarId: () => string): string[] {
    if (cambios.metadatos) this.props.metadatos = cambios.metadatos;
    if (cambios.texto === undefined) return [];
    const anteriores = this.props.oraciones;
    const nuevas = segmentar(cambios.texto, anteriores, generarId);
    if (nuevas.length === 0) throw new DatoLecturaInvalidoError('La lectura necesita texto');
    this.props.oraciones = nuevas;
    return this.ajustarReferencias(new Map(anteriores.map((o) => [o.id, o.orden])));
  }

  unirOraciones(oracionId: string): void {
    const { oraciones, absorbida } = unirConSiguiente(this.props.oraciones, oracionId);
    this.props.oraciones = oraciones;
    for (const a of this.props.actividades) {
      if (a.oracionAnclajeId === absorbida) a.oracionAnclajeId = oracionId;
      for (const it of a.items) {
        it.clavesEvidencia = [...new Set(it.clavesEvidencia.map((c) => (c === absorbida ? oracionId : c)))];
      }
    }
  }

  dividirOracion(oracionId: string, posicion: number, generarId: () => string): void {
    this.props.oraciones = dividir(this.props.oraciones, oracionId, posicion, generarId);
  }

  /** RF-024, RF-025: reemplaza todas las actividades del borrador. */
  reemplazarActividades(entrada: ActividadNueva[], generarId: () => string): void {
    this.props.actividades = construirActividades(entrada, new Set(this.props.oraciones.map((o) => o.id)), generarId);
  }

  /** RF-029: reemplaza el grafo de la historia ramificada (vacío = lectura lineal). */
  reemplazarGrafo(entrada: NodoNuevo[], generarId: () => string): void {
    this.props.nodos = construirGrafo(entrada, generarId);
  }

  agregarRecurso(recurso: Recurso): void {
    this.props.recursos.push(recurso);
  }

  quitarRecurso(recursoId: string): void {
    const antes = this.props.recursos.length;
    this.props.recursos = this.props.recursos.filter((r) => r.id !== recursoId);
    if (this.props.recursos.length === antes) throw new DatoLecturaInvalidoError('Ese recurso no está en esta lectura');
  }

  /** RF-021, RF-025, RF-029, RN-15, RNF-006: lo que falta para poder enviarla a revisión y publicarla. */
  problemasParaRevision(): string[] {
    const m = this.props.metadatos;
    const problemas: string[] = [];
    if (!m.licencia) problemas.push('Declara la licencia del texto');
    if (m.habilidadesObjetivo.length === 0) problemas.push('Elige al menos una habilidad objetivo');
    if (this.props.oraciones.length === 0) problemas.push('La lectura necesita texto');
    problemas.push(...problemasDeActividades(this.props.actividades));
    problemas.push(...problemasDelGrafo(this.props.nodos));
    if (this.pesoBytes > PESO_MAXIMO_LECTURA) {
      problemas.push(`La lectura pesa ${(this.pesoBytes / 1024 / 1024).toFixed(2).replace('.', ',')} MB; el máximo es 1,5 MB`);
    }
    return problemas;
  }

  /** RF-026: el autor la envía a revisión cuando está completa. */
  enviarARevision(actorId: string, ahora: Date): void {
    this.asegurarEditablePor(actorId);
    const problemas = this.problemasParaRevision();
    if (problemas.length) throw new LecturaIncompletaError(problemas);
    this.props.estado = 'EN_REVISION';
    this.props.enviadaRevisionEn = ahora;
    this.props.comentarioRevision = null;
  }

  /** RF-026, RN-15: otra persona la aprueba y queda publicada (inmutable desde ahora). */
  aprobar(revisorId: string, ahora: Date): void {
    if (this.props.estado !== 'EN_REVISION') throw new TransicionInvalidaError('Solo se aprueba una lectura que está en revisión');
    if (revisorId === this.props.autorId) throw new AutorNoPuedeAprobarError();
    const problemas = this.problemasParaRevision();
    if (problemas.length) throw new LecturaIncompletaError(problemas);
    this.props.estado = 'PUBLICADO';
    this.props.revisorId = revisorId;
    this.props.publicadaEn = ahora;
  }

  /** RF-026: vuelve a borrador con el motivo, para que el autor la corrija. */
  rechazar(revisorId: string, comentario: string): void {
    if (this.props.estado !== 'EN_REVISION') throw new TransicionInvalidaError('Solo se devuelve una lectura que está en revisión');
    if (revisorId === this.props.autorId) throw new AutorNoPuedeAprobarError();
    const motivo = comentario.trim();
    if (motivo.length < 5 || motivo.length > 1000) throw new DatoLecturaInvalidoError('Explica qué hay que corregir (5 a 1000 caracteres)');
    this.props.estado = 'BORRADOR';
    this.props.comentarioRevision = motivo;
  }

  /** Publicada → archivada: sale de la biblioteca, pero las sesiones hechas la siguen referenciando. */
  archivar(ahora: Date): void {
    if (this.props.estado !== 'PUBLICADO') throw new TransicionInvalidaError('Solo se archiva una versión publicada');
    this.props.estado = 'ARCHIVADO';
    this.props.archivadaEn = ahora;
  }

  private ajustarReferencias(ordenAnterior: Map<string, number>): string[] {
    const vigentes = this.props.oraciones;
    const ids = new Set(vigentes.map((o) => o.id));
    const ajustes: string[] = [];
    for (const a of this.props.actividades) {
      if (a.oracionAnclajeId && !ids.has(a.oracionAnclajeId)) {
        const orden = Math.min(ordenAnterior.get(a.oracionAnclajeId) ?? 1, vigentes.length);
        a.oracionAnclajeId = (vigentes.find((o) => o.orden === orden) ?? vigentes[vigentes.length - 1])?.id ?? null;
        ajustes.push(`Actividad ${a.orden}: su oración cambió; revisa dónde aparece`);
      }
      for (const it of a.items) {
        const quedan = it.clavesEvidencia.filter((c) => ids.has(c));
        if (quedan.length !== it.clavesEvidencia.length) {
          it.clavesEvidencia = quedan;
          ajustes.push(`Actividad ${a.orden}, pregunta ${it.orden}: se quitaron evidencias que ya no están en el texto`);
        }
      }
    }
    return ajustes;
  }
}
