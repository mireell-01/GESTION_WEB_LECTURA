import { Provider } from '@nestjs/common';

import { EscuelaFacade } from '../../escuela/public-api';
import { IamFacade } from '../../iam/public-api';
import { BUS_EVENTOS, BusEventos, PrismaService, uuidV7 } from '../../shared-kernel/public-api';
import { CASOS_USO_DIAGNOSTICO, CasosUsoDiagnostico } from '../application/casos-uso-diagnostico';
import { ReevaluacionesUseCase } from '../application/use-cases/reevaluaciones.use-case';
import { RetoUseCase } from '../application/use-cases/reto.use-case';
import { AulasDocenteEscuela, IdentidadEstudiantesIam } from './anticorrupcion';
import { DiagnosticoInicialRegistro } from './diagnostico-inicial-registro';
import { PrismaBancoItems, PrismaDiagnosticoRepository } from './persistence/prisma-diagnostico-repository';

/** Composition root del Diagnóstico. */
export function crearCasosUsoDiagnostico(prisma: PrismaService, bus: BusEventos, iam: IamFacade, escuela: EscuelaFacade): CasosUsoDiagnostico {
  const ahora = () => new Date();
  const generarId = () => uuidV7();
  const repo = new PrismaDiagnosticoRepository(prisma);
  const identidad = new IdentidadEstudiantesIam(iam);
  return {
    reto: new RetoUseCase(repo, new PrismaBancoItems(prisma), identidad, bus, generarId, ahora),
    reevaluaciones: new ReevaluacionesUseCase(repo, new AulasDocenteEscuela(escuela), identidad, bus, generarId, ahora),
  };
}

/**
 * Vinculación puerto → adaptador (Dependency Injection).
 */
export const diagnosticoProviders: Provider[] = [
  {
    provide: CASOS_USO_DIAGNOSTICO,
    useFactory: crearCasosUsoDiagnostico,
    inject: [PrismaService, BUS_EVENTOS, IamFacade, EscuelaFacade],
  },
  // RN-05 y RF-033: Aventura consulta el reto inicial por el shared-kernel.
  DiagnosticoInicialRegistro,
];
