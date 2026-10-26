import {
  BusEventos,
  DatosItemRespondido,
  DatosMaestriaActualizada,
  DatosMaestriaNivelSubido,
  DatosSesionLectura,
  esHabilidad,
  fechaLocalLima,
  FuenteFichasLectura,
  Habilidad,
  nivelDeclarado,
  ResolutorAvanceLecturas,
  ResolutorMaestria,
} from '../../../shared-kernel/public-api';
import { CuentaGamificacion } from '../../domain/entities/cuenta-gamificacion';
import { habilidadDelReto, LecturaSugerida, RetoDiario } from '../../domain/entities/reto-diario';
import { idDeterminista } from '../../domain/services/id-origen';
import { ParametrosGamificacion } from '../../domain/services/parametros';
import { puntosDeItem } from '../../domain/services/politica-puntos';
import { alcanzaNivel } from '../../domain/services/reglas-insignia';
import { ClaveEvento, GamificacionRepository, IdentidadEstudiantes } from '../ports/gamificacion.ports';

/**
 * Gamificación escucha lo que el niño logra en el resto de la plataforma (SAD §6) y lo convierte en
 * puntos (RF-056), insignias (RF-058), racha (RF-061) y avance del reto del día (RF-060). Cada evento se
 * aplica una sola vez aunque el outbox lo reintente.
 */
export class LogrosUseCase {
  constructor(
    private readonly repo: GamificacionRepository,
    private readonly identidad: IdentidadEstudiantes,
    private readonly maestria: ResolutorMaestria,
    private readonly fichas: FuenteFichasLectura,
    private readonly avance: ResolutorAvanceLecturas,
    private readonly bus: BusEventos,
    private readonly generarId: () => string,
    private readonly ahora: () => Date,
  ) {}

  /** RN-11, RN-12, RN-19, UAT-02, UAT-03: cada pregunta cerrada (o abierta enviada) de una lectura. */
  async alItem(d: DatosItemRespondido): Promise<void> {
    if (d.esCorrecta === false) return; // RN-10: equivocarse no resta ni cuenta
    const ahora = this.ahora();
    const rango = d.esCorrecta === null ? ((await this.identidad.perfil(d.estudianteId))?.rangoEdad ?? null) : null;
    await this.retoDeHoy(d.estudianteId, fechaLocalLima(ahora));
    await this.aplicar(d.estudianteId, { tipo: 'ITEM', origenId: d.respuestaId }, ahora, (cuenta, p) => {
      const otorgado = puntosDeItem(d, p, rango);
      if (!otorgado) return; // abierta sin el esfuerzo pedido
      cuenta.otorgarPuntos(otorgado.motivo, otorgado.puntos, d.respuestaId, d.esRepeticion);
      if (d.esCorrecta && d.modalidad === 'EVIDENCIA' && !d.esRepeticion) cuenta.contar('EVIDENCIAS', d.respuestaId);
      cuenta.avanzarReto(d.habilidad);
    });
  }

  /** RF-047 → +20 (RN-11), un día más de racha (RF-061) y las insignias de lecturas (RF-058). */
  async alLecturaFinalizada(d: DatosSesionLectura): Promise<void> {
    const sesionId = d.sesionId;
    if (!sesionId) return;
    await this.aplicar(d.estudianteId, { tipo: 'LECTURA', origenId: sesionId }, this.ahora(), (cuenta, p) => {
      cuenta.otorgarPuntos('LECTURA_COMPLETADA', p.puntos.lecturaCompletada, sesionId, d.esRepeticion === true);
      if (!d.esRepeticion) cuenta.contar('LECTURAS', sesionId);
      cuenta.registrarDiaLector(sesionId);
    });
  }

  /** RN-11: +50 la primera vez que una habilidad llega a cada nivel CNEB (bajar y volver a subir no suma de nuevo). */
  async alNivelSubido(d: DatosMaestriaNivelSubido): Promise<void> {
    if (!esHabilidad(d.habilidad)) return;
    const origenId = idDeterminista('nivel', d.estudianteId, d.habilidad, d.nivelNuevo);
    await this.aplicar(d.estudianteId, { tipo: 'NIVEL', origenId }, this.ahora(), (cuenta, p) => {
      cuenta.otorgarPuntos('SUBIDA_NIVEL_CNEB', p.puntos.subidaNivelCneb, origenId);
    });
  }

  /** RF-058: insignias por el nivel declarado de una habilidad (RN-08), como "Maestro de las Inferencias". */
  async alMaestria(d: DatosMaestriaActualizada): Promise<void> {
    const habilidad = d.habilidad;
    if (!esHabilidad(habilidad) || d.valorNuevo === undefined) return;
    const nivel = nivelDeclarado(d.valorNuevo, d.itemsContados ?? 0);
    if (!nivel) return;
    const catalogo = await this.repo.insignias();
    const aplica = catalogo.some((i) => i.regla.tipo === 'NIVEL_HABILIDAD' && i.regla.habilidad === habilidad && alcanzaNivel(nivel, i.regla.nivel));
    if (!aplica) return;
    const origenId = idDeterminista('maestria', d.estudianteId, habilidad, nivel);
    await this.aplicar(d.estudianteId, { tipo: 'MAESTRIA', origenId }, this.ahora(), (cuenta) => cuenta.alcanzarNivelHabilidad(habilidad, nivel, origenId));
  }

  /** SAD §6: MundoDesbloqueado → la insignia de rango del mundo completado. */
  async alMundo(d: { estudianteId: string; mundoCompletado: number }): Promise<void> {
    if (!Number.isInteger(d.mundoCompletado)) return;
    const origenId = idDeterminista('mundo', d.estudianteId, String(d.mundoCompletado));
    await this.aplicar(d.estudianteId, { tipo: 'MUNDO', origenId }, this.ahora(), (cuenta) => cuenta.completarMundo(d.mundoCompletado, origenId));
  }

  /** RF-060, RN-18: el reto de hoy; si aún no existe, lo propone para la habilidad más débil. */
  async retoDeHoy(estudianteId: string, hoy: string): Promise<RetoDiario> {
    const existente = await this.repo.retoDe(estudianteId, hoy);
    if (existente) return existente;
    const habilidad = habilidadDelReto(await this.maestria.maestriasDe(estudianteId));
    const lectura = await this.lecturaPara(estudianteId, habilidad);
    return this.repo.proponerReto(RetoDiario.proponer({ id: this.generarId(), estudianteId, fecha: hoy, habilidad, lectura }));
  }

  /** Una lectura de su edad que trabaje esa habilidad y que aún no haya terminado (la más sencilla). */
  private async lecturaPara(estudianteId: string, habilidad: Habilidad): Promise<LecturaSugerida | null> {
    const perfil = await this.identidad.perfil(estudianteId);
    if (!perfil) return null;
    const candidatas = (await this.fichas.publicadas(perfil.rangoEdad)).filter((f) => f.habilidadesObjetivo?.includes(habilidad));
    if (candidatas.length === 0) return null;
    const avance = await this.avance.avanceDe(estudianteId, candidatas.map((f) => f.id));
    const elegida = candidatas
      .filter((f) => avance.get(f.id) !== 'FINALIZADA')
      .sort((a, b) => a.nivelDificultad - b.nivelDificultad || a.titulo.localeCompare(b.titulo, 'es'))[0];
    return elegida ? { id: elegida.id, titulo: elegida.titulo } : null;
  }

  private async aplicar(
    estudianteId: string,
    clave: ClaveEvento,
    ahora: Date,
    operar: (cuenta: CuentaGamificacion, p: ParametrosGamificacion) => void,
  ): Promise<void> {
    const [p, catalogo] = await Promise.all([this.repo.parametros(), this.repo.insignias()]);
    const cuenta = await this.repo.aplicar(estudianteId, clave, fechaLocalLima(ahora), (estado) => {
      const c = new CuentaGamificacion(estado, catalogo, p, ahora);
      operar(c, p);
      return c;
    });
    // Se publica después de guardar: así nadie ve un logro que no quedó registrado.
    const eventos = cuenta?.eventosPendientes() ?? [];
    if (eventos.length > 0) await this.bus.publicar(eventos);
  }
}
