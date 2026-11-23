import { MensajeDocente, Sticker } from '../../domain/entities/mensaje-docente';

/** Un envío de la docente, agrupado: a quién fue y cuántos niños ya lo leyeron. */
export interface EnvioResumen {
  envioId: string;
  sticker: Sticker;
  texto: string;
  creadoEn: Date;
  paraTodaElAula: boolean;
  estudianteIds: string[];
  leidos: number;
}

/** Puerto de salida: persistencia de los mensajitos de la docente. */
export interface MensajeRepository {
  guardar(mensajes: MensajeDocente[]): Promise<void>;
  /** Cuántos envíos hizo el aula entre dos instantes (para el tope diario). */
  contarEnvios(aulaId: string, desde: Date, hasta: Date): Promise<number>;
  /** Los últimos envíos del aula, del más nuevo al más antiguo. */
  envios(aulaId: string, limite: number): Promise<EnvioResumen[]>;
  /** Los mensajes sin leer del estudiante, de esas aulas, del más nuevo al más antiguo. */
  noLeidos(estudianteId: string, aulaIds: string[], limite: number): Promise<MensajeDocente[]>;
  /** Marca el mensaje como leído; false si no existe o no es de ese estudiante. */
  marcarLeido(mensajeId: string, estudianteId: string, ahora: Date): Promise<boolean>;
  /** RF-012: todos los mensajes del estudiante, para la exportación de sus datos. */
  deEstudiante(estudianteId: string): Promise<MensajeDocente[]>;
  /** RF-013: al eliminar el perfil, sus mensajes se borran. */
  eliminarDeEstudiante(estudianteId: string): Promise<void>;
}
