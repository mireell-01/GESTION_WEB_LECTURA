import { Provider } from '@nestjs/common';

import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import {
  AVANCE_LECTURAS,
  BUS_EVENTOS,
  BusEventos,
  DIAGNOSTICO_INICIAL,
  FICHAS_LECTURA,
  FuenteFichasLectura,
  MISION_EN_CURSO,
  PrismaService,
  ResolutorAvanceLecturas,
  ResolutorDiagnosticoInicial,
  ResolutorMisionEnCurso,
} from '../../shared-kernel/public-api';
import { CASOS_USO_PROGRESO, CasosUsoProgreso } from '../application/casos-uso-progreso';
import { PerfilLectorUseCase } from '../application/use-cases/perfil-lector.use-case';
import { RecomendacionesUseCase } from '../application/use-cases/recomendaciones.use-case';
import { AsignacionesEscuela, IdentidadEstudiantesIam } from './anticorrupcion';
import { IntegracionProgreso } from './integracion-progreso';
import {
  PrismaPerfilRepository,
  PrismaRecomendacionRepository,
} from './persistence/prisma-progreso-repository';

/** Composition root de Progreso. */
export function crearCasosUsoProgreso(
  prisma: PrismaService,
  bus: BusEventos,
  iam: IamFacade,
  escuela: EscuelaFacade,
  diagnostico: ResolutorDiagnosticoInicial,
  fichas: FuenteFichasLectura,
  avance: ResolutorAvanceLecturas,
  mision: ResolutorMisionEnCurso,
): CasosUsoProgreso {
  const ahora = () => new Date();
  const identidad = new IdentidadEstudiantesIam(iam);
  const perfil = new PerfilLectorUseCase(
    new PrismaPerfilRepository(prisma),
    diagnostico,
    identidad,
    bus,
    ahora,
  );
  return {
    perfil,
    recomendaciones: new RecomendacionesUseCase(
      new PrismaRecomendacionRepository(prisma),
      perfil,
      identidad,
      new AsignacionesEscuela(escuela),
      fichas,
      avance,
      mision,
      ahora,
    ),
  };
}

/**
 * Vinculación puerto → adaptador (Dependency Injection).
 */
export const progresoProviders: Provider[] = [
  {
    provide: CASOS_USO_PROGRESO,
    useFactory: crearCasosUsoProgreso,
    inject: [
      PrismaService,
      BUS_EVENTOS,
      IamFacade,
      EscuelaFacade,
      DIAGNOSTICO_INICIAL,
      FICHAS_LECTURA,
      AVANCE_LECTURAS,
      MISION_EN_CURSO,
    ],
  },
  IntegracionProgreso,
];
