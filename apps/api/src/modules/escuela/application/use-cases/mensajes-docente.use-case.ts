import { BusEventos, crearEvento, fechaLocalLima, NoEncontradoError } from '../../../shared-kernel/public-api';
import { MensajeDocente, Sticker, STICKERS } from '../../domain/entities/mensaje-docente';
import { DatoMensajeInvalidoError, DemasiadosMensajesError } from '../../domain/errors/errores-escuela';
import { EVENTOS_ESCUELA } from '../../domain/events/eventos-escuela';
import { GeneradorId, Reloj } from '../dto/escuela.dto';
import { AulaRepository } from '../ports/aula.repository';
import { EnvioResumen, MensajeRepository } from '../ports/mensaje.repository';
import { MatriculaRepository } from '../ports/matricula.repository';
import { ServicioIdentidad } from '../ports/servicio-identidad';
import { cargarAulaPropia } from '../services/aulas';

/** Los stickers que acepta la interfaz HTTP. */
export { STICKERS };

/** Envíos por aula y por día de Lima: suficiente para animar, sin llenar de avisos a los niños. */
export const MAX_ENVIOS_POR_DIA = 30;
/** Envíos que la docente ve en su lista. */
const ENVIOS_VISIBLES = 20;
/** Mensajes sin leer que ve el niño a la vez. */
const MENSAJES_VISIBLES = 5;

export interface EnviarMensajeInput {
  docenteId: string;
  aulaId: string;
  /** Sin estudiante: para toda el aula. */
  estudianteId?: string | null;
  sticker: string;
  texto: string;
}

/** Un envío tal como lo ve la docente. */
export interface EnvioVista {
  id: string;
  sticker: Sticker;
  texto: string;
  creadoEn: string;
  paraTodaElAula: boolean;
  /** "Toda el aula" o el alias del niño. */
  para: string;
  total: number;
  leidos: number;
}

/** Un mensajito tal como lo ve el niño. */
export interface MensajeParaNinoVista {
  id: string;
  sticker: Sticker;
  texto: string;
  creadoEn: string;
  aula: string;
}

/** El día de Lima de ese instante, como intervalo [inicio, fin). */
function diaDeLima(ahora: Date): { desde: Date; hasta: Date } {
  const desde = new Date(`${fechaLocalLima(ahora)}T00:00:00-05:00`);
  return { desde, hasta: new Date(desde.getTime() + 86_400_000) };
}

/**
 * Mensajitos de la docente: los envía a un niño o a toda su aula activa, ve quién ya los leyó, y el
 * niño ve los suyos sin leer en su inicio y los cierra con «Gracias». RN-17: solo su docente le escribe,
 * y solo mientras el niño está matriculado en esa aula. Cada envío queda auditado (sin el texto).
 */
export class MensajesDocenteUseCase {
  constructor(
    private readonly aulas: AulaRepository,
    private readonly matriculas: MatriculaRepository,
    private readonly mensajes: MensajeRepository,
    private readonly identidad: ServicioIdentidad,
    private readonly bus: BusEventos,
    private readonly generarId: GeneradorId,
    private readonly ahora: Reloj,
  ) {}

  async enviar(entrada: EnviarMensajeInput): Promise<EnvioVista> {
    const ahora = this.ahora();
    const aula = await cargarAulaPropia(this.aulas, entrada.aulaId, entrada.docenteId);
    aula.asegurarEditable();

    const matriculados = (await this.matriculas.listarActivasPorAula(aula.id)).map((m) => m.estudianteId);
    const paraTodaElAula = !entrada.estudianteId;
    if (entrada.estudianteId && !matriculados.includes(entrada.estudianteId)) {
      throw new DatoMensajeInvalidoError('Elige un estudiante matriculado en esta aula');
    }
    const destinatarios = paraTodaElAula ? matriculados : [entrada.estudianteId as string];

    const envioId = this.generarId();
    const nuevos = MensajeDocente.enviar({
      envioId,
      generarId: this.generarId,
      aulaId: aula.id,
      docenteId: entrada.docenteId,
      estudianteIds: destinatarios,
      paraTodaElAula,
      sticker: entrada.sticker,
      texto: entrada.texto,
      ahora,
    });
    const hoy = diaDeLima(ahora);
    if ((await this.mensajes.contarEnvios(aula.id, hoy.desde, hoy.hasta)) >= MAX_ENVIOS_POR_DIA) {
      throw new DemasiadosMensajesError(MAX_ENVIOS_POR_DIA);
    }
    await this.mensajes.guardar(nuevos);
    await this.bus.publicar([
      crearEvento(
        EVENTOS_ESCUELA.MENSAJE_DOCENTE_ENVIADO,
        aula.id,
        { actorId: entrada.docenteId, aulaId: aula.id, estudianteId: paraTodaElAula ? undefined : destinatarios[0], cantidad: nuevos.length },
        ahora,
      ),
    ]);
    const { sticker, texto } = (nuevos[0] as MensajeDocente).datos;
    const resumen: EnvioResumen = {
      envioId,
      sticker,
      texto,
      creadoEn: ahora,
      paraTodaElAula,
      estudianteIds: destinatarios,
      leidos: 0,
    };
    const [vista] = await this.vistas([resumen]);
    return vista as EnvioVista;
  }

  /** Los últimos envíos de su aula, con cuántos niños ya los leyeron. */
  async enviados(entrada: { docenteId: string; aulaId: string }): Promise<EnvioVista[]> {
    const aula = await cargarAulaPropia(this.aulas, entrada.aulaId, entrada.docenteId);
    return this.vistas(await this.mensajes.envios(aula.id, ENVIOS_VISIBLES));
  }

  /** Lo que ve el niño: sus mensajitos sin leer de las aulas donde sigue matriculado. */
  async paraEstudiante(estudianteId: string): Promise<MensajeParaNinoVista[]> {
    const activas = (await this.matriculas.listarPorEstudiante(estudianteId)).filter((m) => m.activa).map((m) => m.aulaId);
    if (activas.length === 0) return [];
    const [mensajes, aulas] = await Promise.all([this.mensajes.noLeidos(estudianteId, activas, MENSAJES_VISIBLES), this.aulas.buscarPorIds(activas)]);
    const nombres = new Map(aulas.map((a) => [a.id, a.nombre]));
    return mensajes.map((m) => {
      const d = m.datos;
      return { id: d.id, sticker: d.sticker, texto: d.texto, creadoEn: d.creadoEn.toISOString(), aula: nombres.get(d.aulaId) ?? '' };
    });
  }

  /** El niño cierra su mensajito con «Gracias». Repetirlo no cambia nada. */
  async marcarLeido(estudianteId: string, mensajeId: string): Promise<{ leido: true }> {
    if (!(await this.mensajes.marcarLeido(mensajeId, estudianteId, this.ahora()))) throw new NoEncontradoError('Mensaje');
    return { leido: true };
  }

  private async vistas(envios: EnvioResumen[]): Promise<EnvioVista[]> {
    const individuales = [...new Set(envios.filter((e) => !e.paraTodaElAula).flatMap((e) => e.estudianteIds))];
    const alias = new Map((await this.identidad.estudiantes(individuales)).map((e) => [e.id, e.alias]));
    return envios.map((e) => ({
      id: e.envioId,
      sticker: e.sticker,
      texto: e.texto,
      creadoEn: e.creadoEn.toISOString(),
      paraTodaElAula: e.paraTodaElAula,
      para: e.paraTodaElAula ? 'Toda el aula' : (alias.get(e.estudianteIds[0] ?? '') ?? 'Un estudiante'),
      total: e.estudianteIds.length,
      leidos: e.leidos,
    }));
  }
}
