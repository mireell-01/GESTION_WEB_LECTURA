import {
  BusEventos,
  DatosItemRespondido,
  DatosMaestriaActualizada,
  DatosMaestriaNivelSubido,
  DatosSesionLectura,
  AvanceLectura,
  esHabilidad,
  FichaLecturaPublicada,
  fechaLocalLima,
  FuenteFichasLectura,
  Habilidad,
  nivelDeclarado,
  ResolutorAvanceLecturas,
  ResolutorMaestria,
} from '../../../shared-kernel/public-api';
import { CuentaGamificacion } from '../../domain/entities/cuenta-gamificacion';
import { habilidadesPorDebilidad, LecturaSugerida, RetoDiario } from '../../domain/entities/reto-diario';
import { idDeterminista } from '../../domain/services/id-origen';
import { ParametrosGamificacion } from '../../domain/services/parametros';
import { puntosDeItem } from '../../domain/services/politica-puntos';
import { alcanzaNivel, aplicarUmbrales } from '../../domain/services/reglas-insignia';
import { ClaveEvento, GamificacionRepository, IdentidadEstudiantes } from '../ports/gamificacion.ports';

/**
 * RF-060: el cuento del día para una habilidad, entre las lecturas de su edad que la trabajan: la más
 * sencilla que aún no terminó; si ya las leyó todas, una para releer que cambia cada día.
 */
export function cuentoDelDia(candidatas: FichaLecturaPublicada[], avance: Map<string, AvanceLectura>, hoy: string): LecturaSugerida | null {
  const orden = [...candidatas].sort((a, b) => a.nivelDificultad - b.nivelDificultad || a.titulo.localeCompare(b.titulo, 'es'));
  if (orden.length === 0) return null;
  const elegida = orden.find((f) => avance.get(f.id) !== 'FINALIZADA') ?? orden[diaDelCalendario(hoy) % orden.length]!;
  return { id: elegida.id, titulo: elegida.titulo };
}

/** Días desde 1970 de una fecha "AAAA-MM-DD": cambia una vez al día. */
function diaDelCalendario(fecha: string): number {
  return Math.floor(Date.parse(`${fecha}T00:00:00Z`) / 86_400_000);
}

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

  /**
   * RF-060, RN-18: el reto de hoy. Si aún no existe, lo propone para la habilidad más débil que tenga
   * lecturas de su edad (así cada día trae su cuento); sin ninguna, para la más débil y sin cuento.
   */
  async retoDeHoy(estudianteId: string, hoy: string): Promise<RetoDiario> {
    const existente = await this.repo.retoDe(estudianteId, hoy);
    if (existente) return existente;
    const orden = habilidadesPorDebilidad(await this.maestria.maestriasDe(estudianteId));
    const cuento = await this.cuentosDelDia(estudianteId, hoy);
    const habilidad = orden.find((h) => cuento(h) !== null) ?? orden[0]!;
    const lectura = cuento(habilidad);
    return this.repo.proponerReto(RetoDiario.proponer({ id: this.generarId(), estudianteId, fecha: hoy, habilidad, lectura }));
  }

  /**
   * El reto que ve el niño. Si se propuso cuando aún no había lecturas de su edad para esa habilidad
   * (por ejemplo, antes de publicar los cuentos), recibe su cuento en cuanto lo haya.
   */
  async retoConCuento(estudianteId: string, hoy: string): Promise<RetoDiario> {
    const reto = await this.retoDeHoy(estudianteId, hoy);
    if (reto.datos.lectura || reto.datos.estado !== 'PROPUESTO') return reto;
    const lectura = (await this.cuentosDelDia(estudianteId, hoy))(reto.datos.habilidad);
    return lectura && reto.sugerir(lectura) ? this.repo.sugerirLectura(reto) : reto;
  }

  /** Las lecturas publicadas de su edad (RN-02) y su avance: para cada habilidad, su cuento del día. */
  private async cuentosDelDia(estudianteId: string, hoy: string): Promise<(habilidad: Habilidad) => LecturaSugerida | null> {
    const perfil = await this.identidad.perfil(estudianteId);
    const fichas = perfil ? await this.fichas.publicadas(perfil.rangoEdad) : [];
    const avance = fichas.length > 0 ? await this.avance.avanceDe(estudianteId, fichas.map((f) => f.id)) : new Map<string, AvanceLectura>();
    return (habilidad) => cuentoDelDia(fichas.filter((f) => f.habilidadesObjetivo?.includes(habilidad)), avance, hoy);
  }

  private async aplicar(
    estudianteId: string,
    clave: ClaveEvento,
    ahora: Date,
    operar: (cuenta: CuentaGamificacion, p: ParametrosGamificacion) => void,
  ): Promise<void> {
    const [p, base] = await Promise.all([this.repo.parametros(), this.repo.insignias()]);
    // RF-078: los umbrales de la versión vigente (un cambio aplica solo a lo que ocurre después).
    const catalogo = aplicarUmbrales(base, p.insignias);
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
