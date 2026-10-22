import { Injectable } from '@nestjs/common';

import { FichaLecturaPublicada, FuenteFichasLectura, RegistroFichasLectura } from '../application/fichas-lectura';
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
