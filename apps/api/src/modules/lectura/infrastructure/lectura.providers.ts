import { Inject, Injectable, OnModuleInit, Provider } from '@nestjs/common';

import { ContenidoFacade } from '../../contenido/public-api';
import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import {
  AVANCE_LECTURAS,
  BUS_EVENTOS,
  BusEventos,
  HISTORIAL_LECTURA,
  LECTURAS_REALIZADAS,
  PREGUNTA_EN_CURSO,
  PrismaService,
  RegistroAvanceLecturas,
  RegistroHistorialLectura,
  RegistroLecturasRealizadas,
  RegistroPreguntaEnCurso,
  RegistroRespuestasAbiertas,
  RESPUESTAS_ABIERTAS,
  uuidV7,
} from '../../shared-kernel/public-api';
import { CASOS_USO_LECTURA, CasosUsoLectura } from '../application/casos-uso-lectura';
import { AsistenciaLecturaUseCase } from '../application/use-cases/asistencia.use-case';
import { HistorialUseCase } from '../application/use-cases/historial.use-case';
import { RevisionUseCase } from '../application/use-cases/revision.use-case';
import { SesionesUseCase } from '../application/use-cases/sesiones.use-case';
import { DIAS_PARA_ABANDONO } from '../domain/entities/sesion-lectura';
import { ContenidoLecturasContenido, EscuelaLecturaEscuela, IdentidadEstudiantesIam } from './anticorrupcion';
import { PrismaSesionRepository } from './persistence/prisma-sesion-repository';

/** Composition root de Lectura. */
export function crearCasosUsoLectura(prisma: PrismaService, bus: BusEventos, iam: IamFacade, escuela: EscuelaFacade, contenido: ContenidoFacade): CasosUsoLectura {
  const ahora = () => new Date();
  const generarId = () => uuidV7();
  const repo = new PrismaSesionRepository(prisma);
  const contenidos = new ContenidoLecturasContenido(contenido);
  const identidad = new IdentidadEstudiantesIam(iam);
  const aulas = new EscuelaLecturaEscuela(escuela);
  return {
    sesiones: new SesionesUseCase(repo, contenidos, identidad, aulas, bus, generarId, ahora),
    revision: new RevisionUseCase(repo, contenidos, identidad, aulas, bus, ahora),
    historial: new HistorialUseCase(repo, contenidos),
    asistencia: new AsistenciaLecturaUseCase(repo, contenidos, aulas),
  };
}

/**
 * RF-032: Aventura consulta por el shared-kernel qué lecturas empezó o terminó el niño.
 * RF-059 (Módulo 8): el Pasaporte del Lector muestra las lecturas que terminó.
 * RF-064 (Módulo 9): el detalle docente muestra sus últimas sesiones con evidencias y pistas.
 * RF-072 a RF-075 (Módulo 11): la pregunta en curso para el asistente y las respuestas abiertas.
 */
@Injectable()
export class AvanceLecturasRegistro implements OnModuleInit {
  private readonly repo: PrismaSesionRepository;

  constructor(
    prisma: PrismaService,
    @Inject(AVANCE_LECTURAS) private readonly registro: RegistroAvanceLecturas,
    @Inject(LECTURAS_REALIZADAS) private readonly realizadas: RegistroLecturasRealizadas,
    @Inject(HISTORIAL_LECTURA) private readonly historial: RegistroHistorialLectura,
    @Inject(PREGUNTA_EN_CURSO) private readonly pregunta: RegistroPreguntaEnCurso,
    @Inject(RESPUESTAS_ABIERTAS) private readonly abiertas: RegistroRespuestasAbiertas,
    @Inject(CASOS_USO_LECTURA) private readonly casos: CasosUsoLectura,
  ) {
    this.repo = new PrismaSesionRepository(prisma);
  }

  onModuleInit(): void {
    this.registro.registrar({
      avanceDe: (estudianteId, lecturaIds) =>
        this.repo.avanceDe(estudianteId, lecturaIds, new Date(Date.now() - DIAS_PARA_ABANDONO * 24 * 60 * 60 * 1000)),
    });
    this.realizadas.registrar({ realizadasDe: (estudianteId) => this.repo.realizadasDe(estudianteId) });
    this.historial.registrar({ historialDe: (estudianteId, limite) => this.casos.historial.historialDe(estudianteId, limite) });
    this.pregunta.registrar({ preguntaDe: (estudianteId, sesionId) => this.casos.asistencia.preguntaDe(estudianteId, sesionId) });
    this.abiertas.registrar({ respuestaParaDocente: (docenteId, respuestaId) => this.casos.asistencia.respuestaParaDocente(docenteId, respuestaId) });
  }
}

/** Vinculación puerto → adaptador (Dependency Injection). */
export const lecturaProviders: Provider[] = [
  {
    provide: CASOS_USO_LECTURA,
    useFactory: crearCasosUsoLectura,
    inject: [PrismaService, BUS_EVENTOS, IamFacade, EscuelaFacade, ContenidoFacade],
  },
  AvanceLecturasRegistro,
];
