import { ErrorDeNegocio, NoEncontradoError, ProhibidoError, ResolutorPreguntaEnCurso } from '../../../shared-kernel/public-api';
import { Conversacion, MAX_INTERCAMBIOS } from '../../domain/entities/conversacion';
import { revisarSalida } from '../../domain/services/filtro-salida';
import { Atajo, intencionDe, MENSAJE_CIERRE, TEXTO_ATAJO } from '../../domain/services/mediacion-socratica';
import { moderarEntrada } from '../../domain/services/moderacion-entrada';
import { EstadoAsistente, RespuestaAsistente } from '../dto/asistente.dto';
import { ActivacionRepository, ConversacionRepository, EntradaMotor, MotorAsistente } from '../ports/asistente.ports';

/**
 * Si dos mensajes llegan a la vez, cada uno reintenta con la conversación al día. Perder la carrera
 * significa que otro guardó su intercambio, y no hay más de 10: al undécimo intento ya está agotada.
 */
const INTENTOS = MAX_INTERCAMBIOS + 1;

/**
 * RF-072 a RF-074: el niño conversa con el asistente durante su lectura, si un adulto lo activó. Cada
 * mensaje se modera (sin datos personales ni groserías), el motor responde con una guía socrática a
 * partir de la pregunta en pantalla (nunca su clave) y el filtro de salida revisa la respuesta antes de
 * mostrarla. Hasta 10 intercambios por lectura; el undécimo recibe un cierre amable.
 */
export class ConversarUseCase {
  constructor(
    private readonly repo: ConversacionRepository,
    private readonly activaciones: ActivacionRepository,
    private readonly preguntas: ResolutorPreguntaEnCurso,
    private readonly motor: MotorAsistente,
    /** RNF-011: si el motor falla, responde el mediador sin conexión; la lectura nunca se detiene. */
    private readonly respaldo: MotorAsistente,
    private readonly generarId: () => string,
    private readonly ahora: () => Date,
  ) {}

  async estado(estudianteId: string, sesionId: string): Promise<EstadoAsistente> {
    if (!(await this.preguntas.preguntaDe(estudianteId, sesionId))) throw new NoEncontradoError('Sesión de lectura');
    const [disponible, c] = await Promise.all([this.activaciones.activo(estudianteId), this.repo.deSesion(sesionId)]);
    return {
      disponible,
      intercambios: c?.intercambios ?? 0,
      restantes: c?.restantes ?? MAX_INTERCAMBIOS,
      turnos: (c?.turnos ?? []).map((t) => ({ emisor: t.emisor, texto: t.texto })),
    };
  }

  async conversar(estudianteId: string, sesionId: string, entrada: { mensaje?: string; atajo?: Atajo }): Promise<RespuestaAsistente> {
    if (!entrada.atajo && !entrada.mensaje?.trim()) throw new ErrorDeNegocio('Escribe tu pregunta o elige una ayuda');
    const ctx = await this.preguntas.preguntaDe(estudianteId, sesionId);
    if (!ctx) throw new NoEncontradoError('Sesión de lectura');
    if (!(await this.activaciones.activo(estudianteId))) throw new ProhibidoError('El asistente de lectura no está activado para ti');

    const moderado = entrada.atajo ? { texto: TEXTO_ATAJO[entrada.atajo], motivo: null } : moderarEntrada(entrada.mensaje as string);
    const intencion = intencionDe({ texto: moderado.texto, atajo: entrada.atajo });
    let c = await this.conversacion(estudianteId, sesionId);
    for (let intento = 0; intento < INTENTOS; intento++) {
      if (c.agotada) return { texto: MENSAJE_CIERRE, restantes: 0, filtrado: false, cerrada: true };
      const propuesta = await this.responder({
        contexto: { titulo: ctx.titulo, rangoEdad: ctx.rangoEdad, fase: ctx.fase, pregunta: ctx.pregunta },
        intencion,
        mensaje: moderado.texto,
        moderacion: moderado.motivo,
        intercambio: c.intercambios + 1,
        historial: c.turnos.map((t) => ({ emisor: t.emisor, texto: t.texto })),
      });
      const salida = revisarSalida(propuesta, ctx.claves, ctx.pregunta?.enunciado);
      const previos = c.intercambios;
      const turnos = c.registrar({ texto: moderado.texto, filtrado: moderado.motivo !== null }, { texto: salida.texto, filtrado: salida.bloqueado }, this.ahora());
      if (await this.repo.registrarIntercambio(c, previos, turnos)) {
        return { texto: salida.texto, restantes: c.restantes, filtrado: salida.bloqueado, cerrada: c.agotada };
      }
      c = (await this.repo.deSesion(sesionId)) as Conversacion;
    }
    throw new ErrorDeNegocio('El asistente está ocupado. Inténtalo otra vez.', 'CONFLICTO');
  }

  /** La conversación de la sesión (una sola, aunque dos mensajes lleguen a la vez). */
  private async conversacion(estudianteId: string, sesionId: string): Promise<Conversacion> {
    const existente = await this.repo.deSesion(sesionId);
    if (existente) return existente;
    const nueva = Conversacion.iniciar({ id: this.generarId(), estudianteId, sesionLecturaId: sesionId, ahora: this.ahora() });
    return (await this.repo.crear(nueva)) ? nueva : ((await this.repo.deSesion(sesionId)) as Conversacion);
  }

  private async responder(entrada: EntradaMotor): Promise<string> {
    try {
      return await this.motor.responder(entrada);
    } catch {
      return this.respaldo.responder(entrada);
    }
  }
}
