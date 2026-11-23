import { Provider } from '@nestjs/common';

import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import {
  AVANCE_LECTURAS,
  BUS_EVENTOS,
  BusEventos,
  FICHAS_LECTURA,
  FuenteFichasLectura,
  LECTURAS_REALIZADAS,
  MAESTRIA_LECTOR,
  MUNDOS_COMPLETADOS,
  PrismaService,
  ResolutorAvanceLecturas,
  ResolutorLecturasRealizadas,
  ResolutorMaestria,
  ResolutorMundosCompletados,
  uuidV7,
} from '../../shared-kernel/public-api';
import { CASOS_USO_GAMIFICACION, CasosUsoGamificacion } from '../application/casos-uso-gamificacion';
import { GamificacionFacade } from '../application/gamificacion.facade';
import { AparienciaUseCase } from '../application/use-cases/apariencia.use-case';
import { CopaLectoraUseCase } from '../application/use-cases/copa-lectora.use-case';
import { LogrosUseCase } from '../application/use-cases/logros.use-case';
import { ParametrosAdminUseCase } from '../application/use-cases/parametros-admin.use-case';
import { PasaporteUseCase } from '../application/use-cases/pasaporte.use-case';
import { AulaDelEstudianteEscuela, IdentidadEstudiantesIam } from './anticorrupcion';
import { IntegracionGamificacion } from './integracion-gamificacion';
import { PrismaGamificacionRepository } from './persistence/prisma-gamificacion-repository';
import { PrismaParametrosRepository } from './persistence/prisma-parametros-repository';

/** Composition root de Gamificación. */
export function crearCasosUsoGamificacion(
  prisma: PrismaService,
  bus: BusEventos,
  iam: IamFacade,
  maestria: ResolutorMaestria,
  fichas: FuenteFichasLectura,
  avance: ResolutorAvanceLecturas,
  realizadas: ResolutorLecturasRealizadas,
  mundos: ResolutorMundosCompletados,
  escuela: EscuelaFacade,
): CasosUsoGamificacion {
  const ahora = () => new Date();
  const generarId = () => uuidV7();
  const repo = new PrismaGamificacionRepository(prisma);
  const identidad = new IdentidadEstudiantesIam(iam);
  const logros = new LogrosUseCase(repo, identidad, maestria, fichas, avance, bus, generarId, ahora);
  return {
    logros,
    pasaporte: new PasaporteUseCase(repo, identidad, realizadas, mundos, fichas, logros, bus, generarId, ahora),
    apariencia: new AparienciaUseCase(repo, identidad),
    copa: new CopaLectoraUseCase(repo, identidad, new AulaDelEstudianteEscuela(escuela), ahora),
    facade: new GamificacionFacade(new ParametrosAdminUseCase(new PrismaParametrosRepository(prisma), repo, bus, ahora)),
  };
}

/**
 * Vinculación puerto → adaptador (Dependency Injection).
 */
export const gamificacionProviders: Provider[] = [
  {
    provide: CASOS_USO_GAMIFICACION,
    useFactory: crearCasosUsoGamificacion,
    inject: [PrismaService, BUS_EVENTOS, IamFacade, MAESTRIA_LECTOR, FICHAS_LECTURA, AVANCE_LECTURAS, LECTURAS_REALIZADAS, MUNDOS_COMPLETADOS, EscuelaFacade],
  },
  IntegracionGamificacion,
  {
    provide: GamificacionFacade,
    useFactory: (casos: CasosUsoGamificacion) => casos.facade,
    inject: [CASOS_USO_GAMIFICACION],
  },
];
