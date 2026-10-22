import { BusEventos, crearEvento, NoEncontradoError } from '../../../shared-kernel/public-api';
import { palabrasDeRespuesta, RespuestaItem, SesionLectura } from '../../domain/entities/sesion-lectura';
import { EntradaRespuesta } from '../../domain/services/correccion';
import { Guion } from '../../domain/services/guion';
import { EVENTOS_LECTURA } from '../../domain/events/eventos-lectura';
import { RespuestaVista, SesionVista, vistaSesion } from '../dto/lectura.dto';
import { ContenidoLecturas, EscuelaLectura, IdentidadEstudiantes, SesionRepository } from '../ports/lectura.ports';

/**
 * Casos de uso del estudiante (RF-038 a RF-050): leer una lectura con sus actividades antes, durante
 * y después. Todo se guarda al momento; al volver, la sesión sigue donde quedó (RF-046).
 */
export class SesionesUseCase {
  constructor(
    private readonly repo: SesionRepository,
    private readonly contenidos: ContenidoLecturas,
    private readonly identidad: IdentidadEstudiantes,
    private readonly escuela: EscuelaLectura,
    private readonly bus: BusEventos,
    private readonly generarId: () => string,
    private readonly ahora: () => Date,
  ) {}

  /**
   * RF-038, RF-046: abre la lectura, o reanuda la que dejó a medias. Lee lo de su edad y, además, lo
   * que su docente le asignó; lo demás responde como si no existiera.
   */
  async iniciar(estudianteId: string, entrada: { lecturaId: string; asignacionId?: string | null }): Promise<SesionVista> {
    const activa = await this.activaVigente(estudianteId, entrada.lecturaId);
    if (activa) return this.vista(activa);

    const contenido = await this.contenidos.publicada(entrada.lecturaId);
    if (!contenido) throw new NoEncontradoError('Lectura');
    const [perfil] = await this.identidad.perfiles([estudianteId]);
    if (!perfil?.activo) throw new NoEncontradoError('Estudiante');
    const asignada = entrada.asignacionId ? await this.escuela.asignacionDeLectura(estudianteId, entrada.asignacionId, entrada.lecturaId) : false;
    if (contenido.rangoEdad !== perfil.rangoEdad && !asignada) throw new NoEncontradoError('Lectura');

    const nueva = SesionLectura.iniciar({
      id: this.generarId(),
      estudianteId,
      lecturaId: contenido.lecturaId,
      versionLecturaId: contenido.versionId,
      asignacionId: asignada ? (entrada.asignacionId as string) : null,
      esRepeticion: await this.repo.tieneFinalizada(estudianteId, contenido.lecturaId),
      ahora: this.ahora(),
    });
    // Dos pedidos a la vez: gana el primero y ambos siguen con la misma sesión.
    if (!(await this.repo.crear(nueva))) return this.vista((await this.repo.activaDe(estudianteId, entrada.lecturaId)) as SesionLectura);
    await this.publicar(EVENTOS_LECTURA.INICIADA, nueva, { esRepeticion: nueva.esRepeticion, versionLecturaId: nueva.versionLecturaId, asignacionId: nueva.asignacionId });
    return vistaSesion(nueva, new Guion(contenido));
  }

  async ver(estudianteId: string, sesionId: string): Promise<SesionVista> {
    return this.vista(await this.suya(estudianteId, sesionId));
  }

  /** RF-038: la predicción a partir del título y la imagen; recién entonces se muestra el texto. */
  async predecir(estudianteId: string, sesionId: string, entrada: { texto?: string; indice?: number }): Promise<SesionVista & { filtrado: boolean }> {
    const s = await this.suya(estudianteId, sesionId);
    const g = await this.guion(s);
    const { filtrado } = s.predecir(g, entrada, this.ahora());
    await this.repo.guardar(s);
    return { ...vistaSesion(s, g), filtrado };
  }

  /** RF-040 a RF-045, RF-049: corrige en el servidor y entrega la pista o la explicación. Idempotente (RF-046). */
  async responder(estudianteId: string, sesionId: string, entrada: { itemId: string; idempotencyKey: string } & EntradaRespuesta): Promise<RespuestaVista> {
    const s = await this.suya(estudianteId, sesionId);
    const g = await this.guion(s);
    const { itemId, idempotencyKey, ...respuesta } = entrada;
    const r = s.responder(g, { itemId, entrada: respuesta, idempotencyKey, ahora: this.ahora(), generarId: this.generarId });
    if (!r.repetido) {
      await this.repo.guardar(s);
      if (r.resuelta) await this.publicarItem(s, g, r.respuesta);
    }
    return { respuestaId: r.respuesta.id, resultado: r.resultado, pista: r.pista, explicacion: r.explicacion, filtrado: r.filtrado, sesion: vistaSesion(s, g) };
  }

  /** RF-045: el niño pide una pista sin haber respondido (cuenta para el puntaje del ítem, RN-07). */
  async pedirPista(estudianteId: string, sesionId: string, itemId: string) {
    const s = await this.suya(estudianteId, sesionId);
    const g = await this.guion(s);
    const pista = s.pedirPista(g, { itemId, ahora: this.ahora(), generarId: this.generarId });
    await this.repo.guardar(s);
    return { pista, sesion: vistaSesion(s, g) };
  }

  /** RF-048: la decisión en la historia ramificada queda registrada y define el nodo siguiente. */
  async decidir(estudianteId: string, sesionId: string, entrada: { nodoId: string; opcion: number }): Promise<SesionVista> {
    const s = await this.suya(estudianteId, sesionId);
    const g = await this.guion(s);
    s.decidir(g, { ...entrada, ahora: this.ahora(), generarId: this.generarId });
    await this.repo.guardar(s);
    return vistaSesion(s, g);
  }

  /** RF-047: la reflexión final; con ella termina la lectura y Aventura avanza su misión (RF-032). */
  async finalizar(estudianteId: string, sesionId: string, reflexion: string): Promise<SesionVista & { filtrado: boolean }> {
    const s = await this.suya(estudianteId, sesionId);
    const g = await this.guion(s);
    const { filtrado } = s.finalizar(g, { reflexion, ahora: this.ahora(), conDocente: await this.escuela.tieneDocente(estudianteId) });
    await this.repo.guardar(s);
    const resumen = s.resumen(g);
    await this.publicar(EVENTOS_LECTURA.FINALIZADA, s, { esRepeticion: s.esRepeticion, versionLecturaId: s.versionLecturaId, asignacionId: s.asignacionId, ...resumen });
    return { ...vistaSesion(s, g), filtrado };
  }

  private async vista(s: SesionLectura): Promise<SesionVista> {
    return vistaSesion(s, await this.guion(s));
  }

  /** La sesión sin terminar de esa lectura; si pasó 7 días sin actividad, queda abandonada (SRS §3.6). */
  private async activaVigente(estudianteId: string, lecturaId: string): Promise<SesionLectura | null> {
    const activa = await this.repo.activaDe(estudianteId, lecturaId);
    if (!activa) return null;
    if (!(await this.abandonarSiCorresponde(activa))) return activa;
    return null;
  }

  private async abandonarSiCorresponde(s: SesionLectura): Promise<boolean> {
    if (!s.abandonarSiInactiva(this.ahora())) return false;
    await this.repo.guardar(s);
    await this.publicar(EVENTOS_LECTURA.ABANDONADA, s, {});
    return true;
  }

  /** Una sesión solo la ve su estudiante: la de otro niño responde como si no existiera. */
  private async suya(estudianteId: string, sesionId: string): Promise<SesionLectura> {
    const s = await this.repo.buscar(sesionId);
    if (!s || s.estudianteId !== estudianteId) throw new NoEncontradoError('Lectura');
    await this.abandonarSiCorresponde(s);
    return s;
  }

  private async guion(s: SesionLectura): Promise<Guion> {
    const contenido = await this.contenidos.version(s.versionLecturaId);
    if (!contenido) throw new NoEncontradoError('Lectura');
    return new Guion(contenido);
  }

  /** RF-053, RN-07, RN-11: Progreso y Gamificación reaccionan a cada pregunta cerrada. */
  private publicarItem(s: SesionLectura, g: Guion, r: RespuestaItem): Promise<void> {
    const item = g.paso(r.itemId)?.item;
    return this.publicar(EVENTOS_LECTURA.ITEM_RESPONDIDO, s, {
      itemId: r.itemId,
      habilidad: r.habilidad,
      nivelDificultad: item?.nivelDificultad ?? 1,
      esCorrecta: r.esCorrecta,
      pistasUsadas: r.pistasUsadas,
      puntajeItem: r.puntajeItem,
      esRepeticion: s.esRepeticion,
      palabras: palabrasDeRespuesta(r),
    });
  }

  private publicar(nombre: string, s: SesionLectura, extra: Record<string, unknown>): Promise<void> {
    return this.bus.publicar([crearEvento(nombre, s.id, { estudianteId: s.estudianteId, lecturaId: s.lecturaId, sesionId: s.id, ...extra }, this.ahora())]);
  }
}
