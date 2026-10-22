import { Provider } from '@nestjs/common';

import { IamFacade } from '../../iam/public-api';
import {
  AVANCE_LECTURAS,
  BUS_EVENTOS,
  BusEventos,
  DIAGNOSTICO_INICIAL,
  FICHAS_LECTURA,
  FuenteFichasLectura,
  MAESTRIA_LECTOR,
  PrismaService,
  ResolutorAvanceLecturas,
  ResolutorDiagnosticoInicial,
  ResolutorMaestria,
  uuidV7,
} from '../../shared-kernel/public-api';
import { CASOS_USO_AVENTURA, CasosUsoAventura } from '../application/casos-uso-aventura';
import { Posicionamiento } from '../application/services/posicionamiento';
import { MapaUseCase } from '../application/use-cases/mapa.use-case';
import { MisionesBackofficeUseCase } from '../application/use-cases/misiones-backoffice.use-case';
import { ProgresoUseCase } from '../application/use-cases/progreso.use-case';
import { CatalogoMisiones } from './catalogo-misiones';
import { IdentidadEstudiantesIam } from './identidad/identidad-estudiantes-iam';
import { MisionEnCursoRegistro } from './mision-en-curso-registro';
import { PrismaAventuraRepository } from './persistence/prisma-aventura-repository';
import { SuscripcionesAventura } from './suscripciones-aventura';

/** Composition root de Aventura. */
export function crearCasosUsoAventura(
  prisma: PrismaService,
  bus: BusEventos,
  iam: IamFacade,
  diagnostico: ResolutorDiagnosticoInicial,
  maestria: ResolutorMaestria,
  avance: ResolutorAvanceLecturas,
  fichas: FuenteFichasLectura,
): CasosUsoAventura {
  const ahora = () => new Date();
  const repo = new PrismaAventuraRepository(prisma);
  const identidad = new IdentidadEstudiantesIam(iam);
  const posicionamiento = new Posicionamiento(repo, diagnostico, bus, ahora);
  return {
    mapa: new MapaUseCase(repo, identidad, posicionamiento, maestria, avance, fichas, ahora),
    progreso: new ProgresoUseCase(repo, identidad, posicionamiento, maestria, avance, fichas, bus, ahora),
    misiones: new MisionesBackofficeUseCase(repo, fichas, bus, () => uuidV7(), ahora),
  };
}

/**
 * Vinculación puerto → adaptador (Dependency Injection).
 */
export const aventuraProviders: Provider[] = [
  {
    provide: CASOS_USO_AVENTURA,
    useFactory: crearCasosUsoAventura,
    inject: [PrismaService, BUS_EVENTOS, IamFacade, DIAGNOSTICO_INICIAL, MAESTRIA_LECTOR, AVANCE_LECTURAS, FICHAS_LECTURA],
  },
  SuscripcionesAventura,
  // RF-018: misiones que el docente puede asignar.
  CatalogoMisiones,
  // Módulo 7: la lectura que sigue en la misión en curso, para las recomendaciones (RN-20).
  MisionEnCursoRegistro,
];
