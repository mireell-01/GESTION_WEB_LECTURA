import { Conversacion, TurnoAsistente } from '../../domain/entities/conversacion';
import { ContextoMediacion, Intencion } from '../../domain/services/mediacion-socratica';
import { MotivoModeracion } from '../../domain/services/moderacion-entrada';

/** Persistencia de las conversaciones (schema `asistente`, retención de 30 días). */
export interface ConversacionRepository {
  deSesion(sesionLecturaId: string): Promise<Conversacion | null>;
  /** false si un pedido simultáneo ya la creó (una por sesión). */
  crear(c: Conversacion): Promise<boolean>;
  /**
   * Guarda un intercambio solo si nadie más lo hizo antes (intercambios = `previos`): así dos mensajes
   * a la vez no pasan del límite de 10 (RF-074). false si perdió la carrera.
   */
  registrarIntercambio(c: Conversacion, previos: number, turnos: TurnoAsistente[]): Promise<boolean>;
  /** Borra las conversaciones vencidas (más de 30 días) con sus turnos; devuelve cuántas. */
  borrarVencidas(ahora: Date): Promise<number>;
}

export type RolActivador = 'FAMILIAR' | 'DOCENTE';

/** RF-072: el asistente activado (o no) para cada estudiante por su familia o su docente. */
export interface ActivacionRepository {
  activo(estudianteId: string): Promise<boolean>;
  estados(estudianteIds: string[]): Promise<Map<string, boolean>>;
  guardar(p: { estudianteIds: string[]; activo: boolean; cambiadoPor: string; rol: RolActivador; ahora: Date }): Promise<void>;
}

/** Lo que el motor recibe: el contexto (sin la clave), lo que pide el niño y cuántos intercambios van. */
export interface EntradaMotor {
  contexto: ContextoMediacion;
  intencion: Intencion;
  /** El mensaje ya moderado (sin datos personales). */
  mensaje: string;
  moderacion: MotivoModeracion;
  /** 1 a 10. */
  intercambio: number;
  /** Lo conversado antes en la sesión (ya moderado y filtrado). */
  historial: { emisor: 'ESTUDIANTE' | 'ASISTENTE'; texto: string }[];
}

/**
 * Puerto del motor del asistente (ADR-008). Hoy, el mediador socrático sin conexión; mañana puede ser
 * un modelo externo con el mismo contrato. Su salida siempre pasa por el filtro (RF-073) antes de
 * llegar al niño.
 */
export interface MotorAsistente {
  responder(entrada: EntradaMotor): Promise<string>;
}

/** Anticorrupción hacia IAM y Escuela: qué adulto puede activar el asistente de qué niño. */
export interface AccesoAdultos {
  /** La familia que lo creó (no la que lo acompaña por invitación: ahí decide su docente). */
  esResponsable(cuentaId: string, estudianteId: string): Promise<boolean>;
  /** El aula de la docente (RN-17) con su matrícula activa; null si no es suya. */
  aulaDeDocente(docenteId: string, aulaId: string): Promise<{ id: string; estudianteIds: string[] } | null>;
}

/** Anticorrupción hacia IAM: alias y avatar para la lista del aula. */
export interface IdentidadEstudiantes {
  perfiles(ids: string[]): Promise<{ id: string; alias: string; avatar: string }[]>;
}
