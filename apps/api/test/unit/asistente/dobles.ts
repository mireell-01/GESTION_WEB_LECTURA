/**
 * Dobles de prueba del asistente de lectura (Módulo 11): conversaciones y activaciones en memoria (con la
 * misma regla de concurrencia que PostgreSQL), la pregunta en pantalla que entrega Lectura, el acceso de
 * familias y docentes, y un motor espía que puede fallar o "portarse mal" como un modelo externo.
 */
import type { PreguntaEnCurso, ResolutorPreguntaEnCurso, ResolutorRespuestasAbiertas, RespuestaAbiertaParaDocente } from '../../../src/modules/shared-kernel/public-api';
import type {
  AccesoAdultos,
  ActivacionRepository,
  ConversacionRepository,
  EntradaMotor,
  IdentidadEstudiantes,
  MotorAsistente,
  RolActivador,
} from '../../../src/modules/asistente/application/ports/asistente.ports';
import { ActivacionUseCase } from '../../../src/modules/asistente/application/use-cases/activacion.use-case';
import { BorradorUseCase } from '../../../src/modules/asistente/application/use-cases/borrador.use-case';
import { ConversarUseCase } from '../../../src/modules/asistente/application/use-cases/conversar.use-case';
import { Conversacion, ConversacionProps, TurnoAsistente } from '../../../src/modules/asistente/domain/entities/conversacion';
import { MediadorSinConexion } from '../../../src/modules/asistente/infrastructure/motor/mediador-sin-conexion';
import { Reloj } from '../iam/dobles';

const copiar = (p: Readonly<ConversacionProps>): ConversacionProps => ({ ...p, turnos: p.turnos.map((t) => ({ ...t })) });

/** Una conversación por sesión; guardar un intercambio solo funciona si nadie lo hizo antes (como el UPDATE condicional). */
export class ConversacionesEnMemoria implements ConversacionRepository {
  readonly filas = new Map<string, ConversacionProps>();
  async deSesion(sesionLecturaId: string) {
    const f = this.filas.get(sesionLecturaId);
    return f ? Conversacion.reconstruir(copiar(f)) : null;
  }
  async crear(c: Conversacion) {
    if (this.filas.has(c.sesionLecturaId)) return false;
    this.filas.set(c.sesionLecturaId, copiar(c.snapshot));
    return true;
  }
  async registrarIntercambio(c: Conversacion, previos: number, turnos: TurnoAsistente[]) {
    const f = this.filas.get(c.sesionLecturaId);
    if (!f || f.intercambios !== previos) return false;
    f.intercambios = c.intercambios;
    f.cerradaEn = c.snapshot.cerradaEn;
    f.turnos.push(...turnos.map((t) => ({ ...t })));
    return true;
  }
  async borrarVencidas(ahora: Date) {
    const vencidas = [...this.filas].filter(([, f]) => f.expiraEn < ahora);
    for (const [sesion] of vencidas) this.filas.delete(sesion);
    return vencidas.length;
  }
  /** Todo lo guardado de una sesión, para comprobar qué quedó (y qué no). */
  textos(sesionLecturaId: string): string[] {
    return this.filas.get(sesionLecturaId)?.turnos.map((t) => t.texto) ?? [];
  }
}

export class ActivacionesEnMemoria implements ActivacionRepository {
  readonly filas = new Map<string, { activo: boolean; cambiadoPor: string; rol: RolActivador; cambiadoEn: Date }>();
  async activo(estudianteId: string) {
    return this.filas.get(estudianteId)?.activo ?? false;
  }
  async estados(estudianteIds: string[]) {
    return new Map(estudianteIds.filter((id) => this.filas.has(id)).map((id) => [id, this.filas.get(id)!.activo]));
  }
  async guardar(p: { estudianteIds: string[]; activo: boolean; cambiadoPor: string; rol: RolActivador; ahora: Date }) {
    for (const id of p.estudianteIds) this.filas.set(id, { activo: p.activo, cambiadoPor: p.cambiadoPor, rol: p.rol, cambiadoEn: p.ahora });
  }
}

/** Oraciones de "Killa y la llama" (las mismas de las pruebas de Lectura). */
export const TEXTO_KILLA = [
  'Killa vivía en Puno.',
  'Cada mañana cuidaba a su llama Pancho.',
  'Un día Pancho no quiso comer.',
  'Killa vio que tenía una espina en la pata.',
  'Con cuidado le quitó la espina.',
  'Pancho comió feliz y Killa sonrió.',
];

type Pregunta = NonNullable<PreguntaEnCurso['pregunta']>;

/** La pregunta en pantalla de una sesión; por defecto, la inferencia de "Killa y la llama" con su clave. */
export function preguntaEnCurso(p: Partial<Omit<PreguntaEnCurso, 'pregunta'>> & { pregunta?: Partial<Pregunta> | null } = {}): PreguntaEnCurso {
  const { pregunta, ...resto } = p;
  return {
    sesionId: 'sesion-1',
    lecturaId: 'lectura-killa',
    titulo: 'Killa y la llama',
    rangoEdad: 'R2',
    fase: 'LECTURA',
    textoVisible: TEXTO_KILLA.slice(0, 3),
    claves: ['Le dolía algo', 'Pancho tenía una espina en la pata y por eso no quería comer.'],
    ...resto,
    pregunta:
      pregunta === null
        ? null
        : {
            itemId: 'it-sel',
            enunciado: '¿Por qué Pancho no quiso comer?',
            habilidad: 'INF',
            modalidad: 'SELECCION',
            esCerrada: true,
            multiple: false,
            duranteLaLectura: true,
            pistasRestantes: 3,
            ...pregunta,
          },
  };
}

export class PreguntasFalsas implements ResolutorPreguntaEnCurso {
  readonly sesiones = new Map<string, { estudianteId: string; pregunta: PreguntaEnCurso }>();
  poner(estudianteId: string, pregunta: PreguntaEnCurso) {
    this.sesiones.set(pregunta.sesionId, { estudianteId, pregunta });
  }
  async preguntaDe(estudianteId: string, sesionId: string) {
    const s = this.sesiones.get(sesionId);
    return s && s.estudianteId === estudianteId ? s.pregunta : null;
  }
}

export class RespuestasFalsas implements ResolutorRespuestasAbiertas {
  readonly filas = new Map<string, { docenteId: string; respuesta: RespuestaAbiertaParaDocente }>();
  async respuestaParaDocente(docenteId: string, respuestaId: string) {
    const f = this.filas.get(respuestaId);
    return f && f.docenteId === docenteId ? f.respuesta : null;
  }
}

export class AccesoFalso implements AccesoAdultos {
  readonly responsables = new Set<string>();
  readonly aulas = new Map<string, { docenteId: string; estudianteIds: string[] }>();
  async esResponsable(cuentaId: string, estudianteId: string) {
    return this.responsables.has(`${cuentaId}:${estudianteId}`);
  }
  async aulaDeDocente(docenteId: string, aulaId: string) {
    const a = this.aulas.get(aulaId);
    return a && a.docenteId === docenteId ? { id: aulaId, estudianteIds: [...a.estudianteIds] } : null;
  }
}

export class IdentidadFalsa implements IdentidadEstudiantes {
  readonly perfilesPorId = new Map<string, { alias: string; avatar: string }>();
  async perfiles(ids: string[]) {
    return ids.filter((id) => this.perfilesPorId.has(id)).map((id) => ({ id, ...this.perfilesPorId.get(id)! }));
  }
}

/** Anota lo que recibe. Sin respuesta fijada responde como el mediador sin conexión; con un Error, falla. */
export class MotorEspia implements MotorAsistente {
  readonly entradas: EntradaMotor[] = [];
  respuesta: string | Error | null = null;
  private readonly mediador = new MediadorSinConexion();
  async responder(e: EntradaMotor) {
    this.entradas.push(structuredClone(e));
    if (this.respuesta instanceof Error) throw this.respuesta;
    return this.respuesta ?? this.mediador.responder(e);
  }
}

/** Ensambla los casos de uso con sus dobles; cada prueba crea su propio entorno limpio. */
export function crearEntornoAsistente() {
  let secuencia = 0;
  const reloj = new Reloj();
  const conversaciones = new ConversacionesEnMemoria();
  const activaciones = new ActivacionesEnMemoria();
  const preguntas = new PreguntasFalsas();
  const respuestas = new RespuestasFalsas();
  const acceso = new AccesoFalso();
  const identidad = new IdentidadFalsa();
  const motor = new MotorEspia();
  return {
    reloj,
    conversaciones,
    activaciones,
    preguntas,
    respuestas,
    acceso,
    identidad,
    motor,
    conversar: new ConversarUseCase(conversaciones, activaciones, preguntas, motor, new MediadorSinConexion(), () => `conv-${++secuencia}`, reloj.ahora),
    activacion: new ActivacionUseCase(activaciones, acceso, identidad, reloj.ahora),
    borrador: new BorradorUseCase(respuestas),
  };
}

export type EntornoAsistente = ReturnType<typeof crearEntornoAsistente>;
