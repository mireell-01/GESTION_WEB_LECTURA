import { Injectable } from '@nestjs/common';

import {
  PreguntaEnCurso,
  RegistroPreguntaEnCurso,
  RegistroRespuestasAbiertas,
  ResolutorPreguntaEnCurso,
  ResolutorRespuestasAbiertas,
  RespuestaAbiertaParaDocente,
} from '../application/asistencia-lectura';
import { FichaLecturaPublicada, FuenteFichasLectura, RegistroFichasLectura } from '../application/fichas-lectura';
import { RegistroHistorialLectura, ResolutorHistorialLectura, SesionDeHistorial } from '../application/historial-lectura';
import {
  AvanceLectura,
  LecturaDeMision,
  Maestrias,
  RegistroAvanceLecturas,
  RegistroDiagnosticoInicial,
  RegistroMaestria,
  RegistroMisionEnCurso,
  ResolutorAvanceLecturas,
  ResolutorDiagnosticoInicial,
  ResolutorMaestria,
  ResolutorMisionEnCurso,
  ResultadoDiagnosticoInicial,
} from '../application/progreso-lector';
import {
  LecturaRealizada,
  MundoCompletado,
  RegistroLecturasRealizadas,
  RegistroMundosCompletados,
  ResolutorLecturasRealizadas,
  ResolutorMundosCompletados,
} from '../application/logros-lector';
import type { RangoEdad } from '../domain/value-objects/rango-edad';

/** Delegado de las fichas de lectura: sin Contenido registrado, no hay lecturas publicadas. */
@Injectable()
export class RegistroFichasLecturaDelegado implements RegistroFichasLectura {
  private fuente: FuenteFichasLectura | null = null;

  registrar(fuente: FuenteFichasLectura): void {
    this.fuente = fuente;
  }

  async fichas(ids: string[]): Promise<FichaLecturaPublicada[]> {
    return this.fuente && ids.length > 0 ? this.fuente.fichas(ids) : [];
  }

  async publicadas(rangoEdad: RangoEdad): Promise<FichaLecturaPublicada[]> {
    return this.fuente ? this.fuente.publicadas(rangoEdad) : [];
  }
}

/** Delegado del diagnóstico inicial: sin el Módulo 5, responde `SIN_MODULO`. */
@Injectable()
export class RegistroDiagnosticoInicialDelegado implements RegistroDiagnosticoInicial {
  private resolutor: ResolutorDiagnosticoInicial | null = null;

  registrar(resolutor: ResolutorDiagnosticoInicial): void {
    this.resolutor = resolutor;
  }

  async resultadoDe(estudianteId: string): Promise<ResultadoDiagnosticoInicial> {
    return this.resolutor ? this.resolutor.resultadoDe(estudianteId) : { estado: 'SIN_MODULO' };
  }
}

/** Delegado de la maestría: sin el Módulo 7, la maestría aún no se conoce. */
@Injectable()
export class RegistroMaestriaDelegado implements RegistroMaestria {
  private resolutor: ResolutorMaestria | null = null;

  registrar(resolutor: ResolutorMaestria): void {
    this.resolutor = resolutor;
  }

  async maestriasDe(estudianteId: string): Promise<Maestrias | null> {
    return this.resolutor ? this.resolutor.maestriasDe(estudianteId) : null;
  }
}

/** Delegado del avance de lecturas: sin el Módulo 6, ninguna lectura está empezada. */
@Injectable()
export class RegistroAvanceLecturasDelegado implements RegistroAvanceLecturas {
  private resolutor: ResolutorAvanceLecturas | null = null;

  registrar(resolutor: ResolutorAvanceLecturas): void {
    this.resolutor = resolutor;
  }

  async avanceDe(estudianteId: string, lecturaIds: string[]): Promise<Map<string, AvanceLectura>> {
    return this.resolutor && lecturaIds.length > 0 ? this.resolutor.avanceDe(estudianteId, lecturaIds) : new Map();
  }
}

/** Delegado de la misión en curso: sin Aventura registrada, no hay misión que recomendar. */
@Injectable()
export class RegistroMisionEnCursoDelegado implements RegistroMisionEnCurso {
  private resolutor: ResolutorMisionEnCurso | null = null;

  registrar(resolutor: ResolutorMisionEnCurso): void {
    this.resolutor = resolutor;
  }

  async lecturaSiguiente(estudianteId: string): Promise<LecturaDeMision | null> {
    return this.resolutor ? this.resolutor.lecturaSiguiente(estudianteId) : null;
  }
}

/** Delegado de las lecturas realizadas: sin el Módulo 6, el estudiante aún no terminó ninguna. */
@Injectable()
export class RegistroLecturasRealizadasDelegado implements RegistroLecturasRealizadas {
  private resolutor: ResolutorLecturasRealizadas | null = null;

  registrar(resolutor: ResolutorLecturasRealizadas): void {
    this.resolutor = resolutor;
  }

  async realizadasDe(estudianteId: string): Promise<LecturaRealizada[]> {
    return this.resolutor ? this.resolutor.realizadasDe(estudianteId) : [];
  }
}

/** Delegado del historial de lecturas: sin el Módulo 6, el estudiante no tiene sesiones. */
@Injectable()
export class RegistroHistorialLecturaDelegado implements RegistroHistorialLectura {
  private resolutor: ResolutorHistorialLectura | null = null;

  registrar(resolutor: ResolutorHistorialLectura): void {
    this.resolutor = resolutor;
  }

  async historialDe(estudianteId: string, limite: number): Promise<SesionDeHistorial[]> {
    return this.resolutor ? this.resolutor.historialDe(estudianteId, limite) : [];
  }
}

/** Delegado de los mundos completados: sin Aventura registrada, no hay mundos completados. */
@Injectable()
export class RegistroMundosCompletadosDelegado implements RegistroMundosCompletados {
  private resolutor: ResolutorMundosCompletados | null = null;

  registrar(resolutor: ResolutorMundosCompletados): void {
    this.resolutor = resolutor;
  }

  async completadosDe(estudianteId: string): Promise<MundoCompletado[]> {
    return this.resolutor ? this.resolutor.completadosDe(estudianteId) : [];
  }
}

/** Delegado de la pregunta en curso (Módulo 11): sin Lectura, no hay pregunta para el asistente. */
@Injectable()
export class RegistroPreguntaEnCursoDelegado implements RegistroPreguntaEnCurso {
  private resolutor: ResolutorPreguntaEnCurso | null = null;

  registrar(resolutor: ResolutorPreguntaEnCurso): void {
    this.resolutor = resolutor;
  }

  async preguntaDe(estudianteId: string, sesionId: string): Promise<PreguntaEnCurso | null> {
    return this.resolutor ? this.resolutor.preguntaDe(estudianteId, sesionId) : null;
  }
}

/** Delegado de las respuestas abiertas (Módulo 11, RF-075): sin Lectura, no hay respuestas. */
@Injectable()
export class RegistroRespuestasAbiertasDelegado implements RegistroRespuestasAbiertas {
  private resolutor: ResolutorRespuestasAbiertas | null = null;

  registrar(resolutor: ResolutorRespuestasAbiertas): void {
    this.resolutor = resolutor;
  }

  async respuestaParaDocente(docenteId: string, respuestaId: string): Promise<RespuestaAbiertaParaDocente | null> {
    return this.resolutor ? this.resolutor.respuestaParaDocente(docenteId, respuestaId) : null;
  }
}
