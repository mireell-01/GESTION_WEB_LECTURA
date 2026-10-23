import { Inject, Injectable, OnModuleInit, Provider } from '@nestjs/common';

import { ContenidoFacade } from '../../contenido/public-api';
import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import {
  AVANCE_LECTURAS,
  BUS_EVENTOS,
  BusEventos,
  LECTURAS_REALIZADAS,
  PrismaService,
  RegistroAvanceLecturas,
  RegistroLecturasRealizadas,
  uuidV7,
} from '../../shared-kernel/public-api';
import { CASOS_USO_LECTURA, CasosUsoLectura } from '../application/casos-uso-lectura';
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
  };
}

/**
 * RF-032: Aventura consulta por el shared-kernel qué lecturas empezó o terminó el niño.
 * RF-059 (Módulo 8): el Pasaporte del Lector muestra las lecturas que terminó.
 */
@Injectable()
export class AvanceLecturasRegistro implements OnModuleInit {
  private readonly repo: PrismaSesionRepository;

  constructor(
    prisma: PrismaService,
    @Inject(AVANCE_LECTURAS) private readonly registro: RegistroAvanceLecturas,
    @Inject(LECTURAS_REALIZADAS) private readonly realizadas: RegistroLecturasRealizadas,
  ) {
    this.repo = new PrismaSesionRepository(prisma);
  }

  onModuleInit(): void {
    this.registro.registrar({
      avanceDe: (estudianteId, lecturaIds) =>
        this.repo.avanceDe(estudianteId, lecturaIds, new Date(Date.now() - DIAS_PARA_ABANDONO * 24 * 60 * 60 * 1000)),
    });
    this.realizadas.registrar({ realizadasDe: (estudianteId) => this.repo.realizadasDe(estudianteId) });
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
